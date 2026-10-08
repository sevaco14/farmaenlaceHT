// The sandbox remains entirely in us-east-1. No EC2 port is open to the internet.
const ref = name => ({ Ref: name });
const attr = (name, field) => ({ 'Fn::GetAtt': [name, field] });
const sub = value => ({ 'Fn::Sub': value });
export default {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'Sales Coworker hackathon: self-hosted Convex, static Next.js, Bedrock IAM',
  Parameters: {
    VpcId: { Type: 'AWS::EC2::VPC::Id' },
    SubnetA: { Type: 'AWS::EC2::Subnet::Id' },
    SubnetB: { Type: 'AWS::EC2::Subnet::Id' },
    ImageId: { Type: 'AWS::EC2::Image::Id' },
    CloudFrontPrefixList: { Type: 'String' },
    ArtifactBucket: { Type: 'String', Description: 'Existing encrypted bucket with all four public-access blocks enabled' },
  },
  Resources: {
    InstanceRole: {
      Type: 'AWS::IAM::Role', Properties: {
        AssumeRolePolicyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'ec2.amazonaws.com' }, Action: 'sts:AssumeRole' }] },
        ManagedPolicyArns: ['arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'],
        Policies: [{ PolicyName: 'DemoServices', PolicyDocument: { Version: '2012-10-17', Statement: [
          { Effect: 'Allow', Action: ['bedrock:InvokeModel'], Resource: 'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0' },
          { Effect: 'Allow', Action: ['s3:GetObject'], Resource: sub('arn:aws:s3:::${ArtifactBucket}/*') },
        ] } }],
      },
    },
    InstanceProfile: { Type: 'AWS::IAM::InstanceProfile', Properties: { Roles: [ref('InstanceRole')] } },
    LoadBalancerSecurityGroup: { Type: 'AWS::EC2::SecurityGroup', Properties: {
      GroupDescription: 'HTTP only from CloudFront origin-facing network', VpcId: ref('VpcId'),
      SecurityGroupIngress: [{ IpProtocol: 'tcp', FromPort: 80, ToPort: 80, SourcePrefixListId: ref('CloudFrontPrefixList') }],
    } },
    InstanceSecurityGroup: { Type: 'AWS::EC2::SecurityGroup', Properties: {
      GroupDescription: 'HTTP only from application load balancer; administration through SSM', VpcId: ref('VpcId'),
      SecurityGroupIngress: [{ IpProtocol: 'tcp', FromPort: 80, ToPort: 80, SourceSecurityGroupId: ref('LoadBalancerSecurityGroup') }],
    } },
    Server: { Type: 'AWS::EC2::Instance', Properties: {
      ImageId: ref('ImageId'), InstanceType: 't3.small', IamInstanceProfile: ref('InstanceProfile'),
      NetworkInterfaces: [{ DeviceIndex: '0', AssociatePublicIpAddress: true, SubnetId: ref('SubnetA'), GroupSet: [ref('InstanceSecurityGroup')] }],
      MetadataOptions: { HttpTokens: 'required', HttpPutResponseHopLimit: 2 },
      BlockDeviceMappings: [{ DeviceName: '/dev/xvda', Ebs: { VolumeSize: 20, VolumeType: 'gp3', Encrypted: true, DeleteOnTermination: false } }],
      Tags: [{ Key: 'Name', Value: 'farmaenlace-hackathon' }],
      UserData: { 'Fn::Base64': [
        '#!/bin/bash', 'set -euo pipefail', 'dnf install -y docker', 'systemctl enable --now docker',
        'mkdir -p /usr/local/lib/docker/cli-plugins /opt/farmaenlace/convex/data /opt/farmaenlace/web',
        'curl -fsSL https://github.com/docker/compose/releases/download/v2.39.4/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose',
        'chmod +x /usr/local/lib/docker/cli-plugins/docker-compose',
        'if [ ! -f /swapfile ]; then fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap /swapfile; echo "/swapfile none swap sw 0 0" >> /etc/fstab; fi',
        'swapon -a',
      ].join('\n') },
    } },
    LoadBalancer: { Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer', Properties: {
      Scheme: 'internet-facing', Type: 'application', Subnets: [ref('SubnetA'), ref('SubnetB')], SecurityGroups: [ref('LoadBalancerSecurityGroup')],
      LoadBalancerAttributes: [{ Key: 'idle_timeout.timeout_seconds', Value: '180' }],
    } },
    Target: { Type: 'AWS::ElasticLoadBalancingV2::TargetGroup', Properties: {
      Port: 80, Protocol: 'HTTP', VpcId: ref('VpcId'), TargetType: 'instance', Targets: [{ Id: ref('Server') }],
      HealthCheckPath: '/health', HealthCheckIntervalSeconds: 15, HealthyThresholdCount: 2,
    } },
    Listener: { Type: 'AWS::ElasticLoadBalancingV2::Listener', Properties: {
      LoadBalancerArn: ref('LoadBalancer'), Port: 80, Protocol: 'HTTP',
      DefaultActions: [{ Type: 'forward', TargetGroupArn: ref('Target') }],
    } },
    Distribution: { Type: 'AWS::CloudFront::Distribution', Properties: { DistributionConfig: {
      Enabled: true, Comment: 'Sales Coworker hackathon frontend and realtime backend', HttpVersion: 'http2', PriceClass: 'PriceClass_100',
      Origins: [{ Id: 'app', DomainName: attr('LoadBalancer', 'DNSName'), CustomOriginConfig: { HTTPPort: 80, OriginProtocolPolicy: 'http-only', OriginReadTimeout: 60, OriginKeepaliveTimeout: 5 } }],
      DefaultCacheBehavior: {
        TargetOriginId: 'app', ViewerProtocolPolicy: 'redirect-to-https', Compress: true,
        AllowedMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'], CachedMethods: ['GET', 'HEAD'],
        MinTTL: 0, DefaultTTL: 0, MaxTTL: 0,
        ForwardedValues: { QueryString: true, Cookies: { Forward: 'all' }, Headers: ['*'] },
      },
      ViewerCertificate: { CloudFrontDefaultCertificate: true },
    } } },
  },
  Outputs: {
    Url: { Value: sub('https://${Distribution.DomainName}') },
    InstanceId: { Value: ref('Server') },
    ArtifactBucket: { Value: ref('ArtifactBucket') },
    DistributionId: { Value: ref('Distribution') },
    InstanceRoleArn: { Value: attr('InstanceRole', 'Arn') },
  },
};
