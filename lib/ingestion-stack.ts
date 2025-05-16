import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import { InterfaceVpcEndpointAwsService, Port, SecurityGroup, SubnetType, Vpc, } from "aws-cdk-lib/aws-ec2";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { CfnVpcEndpoint } from "aws-cdk-lib/aws-opensearchserverless";
import { Construct } from 'constructs';

export interface IngestionStackProps extends StackProps {
  config: {
    collectionId?: string;
    region?: string;
    ingestionRoleArn?: string;
    ingestionRoleExternalId?: string;
  };
}

export class IngestionStack extends Stack {
  constructor(scope: Construct, id: string, props: IngestionStackProps) {
    super(scope, id, props);

    const {
      region,
      collectionId,
      ingestionRoleArn,
      ingestionRoleExternalId,
    } = props.config;

    const vpc = new Vpc(this, 'Vpc', {
      maxAzs: 3,
      subnetConfiguration: [{
        name: 'public',
        subnetType: SubnetType.PUBLIC,
      }, {
        name: 'private',
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      }],
      natGateways: 0,
    });

    const securityGroup = new SecurityGroup(this, 'SecurityGroup', {
      vpc,
      allowAllOutbound: true,
      allowAllIpv6Outbound: true,
      description: 'OpenSearch Serverless Access',
    });

    // depending on your setup, this rule might need adjustments
    securityGroup.addIngressRule(securityGroup, Port.allTcp());

    // We need to setup a VPC endpoint for STS because the Lambda Function assumes the ingestion role -> if your Lambda
    // Function is calling more AWS services, e.g. DynamoDB, you could consider using a NAT gateway instead.
    // Also, if your VPC is created in a different stack, you should use `new InterfaceVpcEndpoint()` instead of
    // `vpc.addInterfaceEndpoint()` to avoid a cyclic dependency between both stacks.
    vpc.addInterfaceEndpoint('StsVpcEndpoint', {
      service: InterfaceVpcEndpointAwsService.STS,
      subnets: {
        subnets: vpc.privateSubnets,
      },
      securityGroups: [securityGroup],
    });

    const vpcEndpoint = new CfnVpcEndpoint(this, 'VpcEndpoint', {
      name: 'ingestion-aoss-endpoint',
      subnetIds: vpc.privateSubnets.map(s => s.subnetId),
      vpcId: vpc.vpcId,
      securityGroupIds: [securityGroup.securityGroupId],
    });

    const sampleIngestion = new NodejsFunction(this, 'SampleIngestion', {
      timeout: Duration.seconds(60),
      memorySize: 512,
      vpc,
      vpcSubnets: {
        subnets: vpc.privateSubnets,
      },
      securityGroups: [securityGroup],
      environment: {
        AOSS_REGION: region || '',
        AOSS_COLLECTION_ID: collectionId || '',
        INGESTION_ROLE_ARN: ingestionRoleArn || '',
        INGESTION_ROLE_EXTERNAL_ID: ingestionRoleExternalId || '',
      },
    });

    if (ingestionRoleArn) {
      sampleIngestion.addToRolePolicy(new PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [ingestionRoleArn],
      }));
    }

    new CfnOutput(this, 'VpcEndpointOutput', {
      value: vpcEndpoint.attrId,
      description: 'VPC Endpoint ID for OpenSearch Serverless',
    });

    new CfnOutput(this, 'SampleIngestionRole', {
      value: sampleIngestion.role!.roleArn,
      description: 'Role of sample ingestion function',
    });
  }
}
