#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { IngestionStack } from '../lib/ingestion-stack';
import { SearchStack } from "../lib/search-stack";

const app = new App();

/**
 * First, you have to change the constants below. Then, deploy the ingestion stack first and note the output of
 * `VpcEndpointId`. Enter the id in the search stack parameters below and deploy the search stack. Then, note the
 * output of `CollectionId` and `IngestionRoleArn` and enter them in the ingestion stack parameters and update the
 * stack. Finally, you can invoke the Lambda Function from the ingestion stack to ingest sample data to the OpenSearch
 * Serverless collection.
 */

const ingestionAccount = '123456789012';
const searchAccount = '987654321000';
const region = 'eu-central-1';
const ingestionRoleExternalId = 'opensearch';

new IngestionStack(app, 'IngestionStack', {
  env: {
    account: ingestionAccount,
    region,
  },
  config: {
    region,
    // TODO: add collection id and role ARN after deployment of search stack
    collectionId: '',
    ingestionRoleArn: '',
    ingestionRoleExternalId,
  },
});

new SearchStack(app, 'SearchStack', {
  env: {
    account: searchAccount,
    region,
  },
  config: {
    collectionName: 'my-collection',
    indexName: 'user-data',
    otherAwsAccountId: ingestionAccount,
    // TODO: add vpc endpoint id after deployment of ingestion stack
    vpcEndpointId: '',
  },
});
