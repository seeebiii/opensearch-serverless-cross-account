import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { AccountPrincipal, PolicyDocument, PolicyStatement, Role } from "aws-cdk-lib/aws-iam";
import {
  CfnAccessPolicy,
  CfnCollection,
  CfnSecurityPolicy,
} from "aws-cdk-lib/aws-opensearchserverless";
import { Construct } from 'constructs';

export interface SearchStackProps extends StackProps {
  config: {
    collectionName: string;
    indexName: string;
    vpcEndpointId: string;
    otherAwsAccountId: string;
  }
}

export class SearchStack extends Stack {
  constructor(scope: Construct, id: string, props: SearchStackProps) {
    super(scope, id, props);

    const {
      collectionName,
      indexName,
      vpcEndpointId,
      otherAwsAccountId,
    } = props.config;

    const ingestionRole = new Role(this, 'IngestionRole', {
      description: `Role to ingest data to OpenSearch Serverless collection ${collectionName}`,
      assumedBy: new AccountPrincipal(otherAwsAccountId),
      // use a proper external id
      externalIds: ['opensearch'],
      inlinePolicies: {
        'AllowApiCalls': new PolicyDocument({
          statements: [new PolicyStatement({
            // you might want to further limit these permissions, see AWS docs:
            // https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonopensearchserverless.html
            actions: ['aoss:APIAccessAll'],
            resources: ['*'],
            conditions: {
              'StringEquals': {
                'aoss:collection': collectionName,
              },
            },
          })],
        }),
      },
    });

    // set encryption settings
    const securityPolicy = new CfnSecurityPolicy(this, 'EncryptionPolicy', {
      name: `${collectionName}-encryption`,
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [
          {
            ResourceType: 'collection',
            Resource: [`collection/${collectionName}`],
          },
        ],
        AWSOwnedKey: true,
      }),
    });

    // allow data ingestion (create collection items + indices + write documents) by ingestion role
    const accessPolicy = new CfnAccessPolicy(this, 'AccessPolicy', {
      name: `${collectionName}-access`,
      type: 'data',
      policy: JSON.stringify([
        {
          Rules: [
            {
              Resource: [
                `collection/${collectionName}`
              ],
              Permission: [
                // allows all write permissions except deletion, see all permissions here:
                // https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-data-access.html#serverless-data-supported-permissions
                "aoss:CreateCollectionItems"
              ],
              ResourceType: "collection"
            },
            {
              Resource: [`index/${collectionName}/${indexName}`],
              Permission: [
                // allows all write permissions except deletion, see all permissions here:
                // https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-data-access.html#serverless-data-supported-permissions
                "aoss:WriteDocument",
                "aoss:CreateIndex",
                "aoss:UpdateIndex",
                "aoss:DescribeIndex",
              ],
              ResourceType: "index"
            }
          ],
          Principal: [ingestionRole.roleArn],
          Description: "Allow write access from ingestion role"
        },
      ]),
    });

    // allow collection to be accessed from the VPC endpoint in the other AWS account
    const networkPolicy = new CfnSecurityPolicy(this, 'NetworkPolicy', {
      name: `${collectionName}-network`,
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [
            {
              ResourceType: 'collection',
              Resource: [`collection/${collectionName}`],
            },
          ],
          AllowFromPublic: false,
          SourceVPCEs: [vpcEndpointId],
        },
      ]),
    });

    const collection = new CfnCollection(this, 'Collection', {
      name: collectionName,
      type: 'SEARCH',
    });

    // ensure the collection is created after the policies
    collection.addDependency(securityPolicy);
    collection.addDependency(networkPolicy);
    collection.addDependency(accessPolicy);

    new CfnOutput(this, 'CollectionId', {
      value: collection.attrId,
      description: `OpenSearch Serverless collection id for collection ${collectionName}`,
    });

    new CfnOutput(this, 'IngestionRoleArn', {
      value: ingestionRole.roleArn,
      description: 'ARN of ingestion role',
    });
  }
}
