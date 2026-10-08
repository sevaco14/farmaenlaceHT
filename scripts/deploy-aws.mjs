import { CloudFormationClient, CreateStackCommand, DeleteStackCommand, DescribeStacksCommand, DescribeStackEventsCommand } from '@aws-sdk/client-cloudformation';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { S3Client, PutObjectCommand, GetPublicAccessBlockCommand } from '@aws-sdk/client-s3';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import template from '../infra/aws-stack.mjs';

const region = 'us-east-1';
const stackName = 'farmaenlace-hackathon';
const cf = new CloudFormationClient({ region });
const ssm = new SSMClient({ region });
const s3 = new S3Client({ region });
await mkdir('.local', { recursive: true });
const [operation, argument] = process.argv.slice(2);
async function deployment() { return JSON.parse(await readFile('.local/aws-deployment.json', 'utf8')); }
if (operation === 'create') {
  const parameters = { VpcId: 'vpc-040a1d1ab102e085c', SubnetA: 'subnet-09c6e2314a588f636', SubnetB: 'subnet-0e0e0f884d09733a5', ImageId: 'ami-0d27e0fb3bac4d724', CloudFrontPrefixList: 'pl-3b927c52', ArtifactBucket: 'farmaenlace-hackathon-artifacts-qegzkzlwgjn7' };
  const protection = (await s3.send(new GetPublicAccessBlockCommand({ Bucket: parameters.ArtifactBucket }))).PublicAccessBlockConfiguration;
  if (!protection || !['BlockPublicAcls', 'BlockPublicPolicy', 'IgnorePublicAcls', 'RestrictPublicBuckets'].every(key => protection[key])) throw new Error('Artifact bucket must have all four public access blocks enabled.');
  const result = await cf.send(new CreateStackCommand({ StackName: stackName, TemplateBody: JSON.stringify(template), Capabilities: ['CAPABILITY_IAM'], Parameters: Object.entries(parameters).map(([ParameterKey, ParameterValue]) => ({ ParameterKey, ParameterValue })), Tags: [{ Key: 'Project', Value: 'SalesCoworkerHackathon' }] }));
  console.log(JSON.stringify({ stackId: result.StackId }));
} else if (operation === 'remove-failed-stack') {
  const stack = (await cf.send(new DescribeStacksCommand({ StackName: stackName }))).Stacks[0];
  if (stack.StackStatus !== 'ROLLBACK_COMPLETE') throw new Error('Only an already rolled-back failed creation can be removed.');
  await cf.send(new DeleteStackCommand({ StackName: stackName }));
  console.log('Removing failed empty stack; retained artifact bucket is preserved.');
} else if (operation === 'status') {
  const stack = (await cf.send(new DescribeStacksCommand({ StackName: stackName }))).Stacks[0];
  const outputs = Object.fromEntries((stack.Outputs ?? []).map(o => [o.OutputKey, o.OutputValue]));
  if (outputs.InstanceId) await writeFile('.local/aws-deployment.json', JSON.stringify(outputs, null, 2));
  const events = (await cf.send(new DescribeStackEventsCommand({ StackName: stackName }))).StackEvents.slice(0, 12).map(e => ({ resource: e.LogicalResourceId, status: e.ResourceStatus, reason: e.ResourceStatusReason }));
  console.log(JSON.stringify({ status: stack.StackStatus, outputs, events }, null, 2));
} else if (operation === 'upload') {
  const state = await deployment();
  await s3.send(new PutObjectCommand({ Bucket: state.ArtifactBucket, Key: 'release.tar.gz', Body: await readFile(argument), ServerSideEncryption: 'AES256' }));
  console.log('Uploaded private release artifact.');
} else if (operation === 'command') {
  const state = await deployment();
  const commands = await readFile(argument, 'utf8');
  const result = await ssm.send(new SendCommandCommand({ InstanceIds: [state.InstanceId], DocumentName: 'AWS-RunShellScript', Parameters: { commands: [commands], executionTimeout: ['900'] }, TimeoutSeconds: 900 }));
  const commandState = JSON.stringify({ commandId: result.Command.CommandId, instanceId: state.InstanceId, privateOutput: process.argv.includes('--private-output') });
  await writeFile('.local/aws-command.json', commandState);
  await mkdir('.local/aws-commands', { recursive: true });
  await writeFile(`.local/aws-commands/${result.Command.CommandId}.json`, commandState);
  console.log(JSON.stringify({ commandId: result.Command.CommandId }));
} else if (operation === 'result') {
  if (argument && !/^[a-f0-9-]{36}$/.test(argument)) throw new Error('Invalid command ID');
  const state = JSON.parse(await readFile(argument ? `.local/aws-commands/${argument}.json` : '.local/aws-command.json', 'utf8'));
  const result = await ssm.send(new GetCommandInvocationCommand({ CommandId: state.commandId, InstanceId: state.instanceId }));
  if (state.privateOutput) {
    await writeFile('.local/aws-command-output.txt', result.StandardOutputContent ?? '');
    console.log(JSON.stringify({ status: result.Status, exitCode: result.ResponseCode, outputSaved: true, stderr: result.StandardErrorContent }));
  } else console.log(JSON.stringify({ status: result.Status, exitCode: result.ResponseCode, stdout: result.StandardOutputContent, stderr: result.StandardErrorContent }));
} else throw new Error('Use create | status | upload <tar.gz> | command <script> [--private-output] | result');
