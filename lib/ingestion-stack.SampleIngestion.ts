import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws-v3';

function createClient(region: string, searchDomain: string, ingestionRoleArn: string, ingestionRoleExternalId: string): Client {
  return new Client({
    ...AwsSigv4Signer({
      region,
      service: 'aoss',
      getCredentials: () => {
        const crossAccountRoleProvider = fromTemporaryCredentials({
          params: {
            RoleArn: ingestionRoleArn,
            ExternalId: ingestionRoleExternalId,
          },
          clientConfig: {
            region,
            endpoint: `https://sts.${region}.amazonaws.com`,
          },
        });
        return crossAccountRoleProvider();
      },
    }),
    node: `https://${searchDomain}.${region}.aoss.amazonaws.com`,
  });
}

async function createIndex(client: Client, indexName: string) {
  try {
    console.log(`Checking index ${indexName}`);
    const indexExists = await client.indices.exists({ index: indexName });

    if (!indexExists.body) {
      console.log(`Creating index ${indexName}`);
      const response = await client.indices.create({
        index: indexName,
        body: {
          mappings: {
            properties: {
              firstName: { type: 'text' },
              lastName: { type: 'text' },
              birthdate: {
                type: 'date',
                format: 'strict_date_optional_time||epoch_millis',
              },
            },
          },
        },
      });

      console.log(`Index ${indexName} created:`, response.body);
    }
  } catch (error) {
    console.error(`Error creating index ${indexName}:`, error);
  }
}

async function indexSampleData(client: Client, indexName: string) {
  console.log(`Indexing sample data to index ${indexName}`);

  await client.index({
    index: indexName,
    body: {
      firstName: 'John',
      lastName: 'Doe',
      birthdate: new Date('1970-01-01T01:01:00.000Z').getTime(),
    },
  });
}

async function searchSampleData(client: Client, indexName: string) {
  console.log(`Search sample data in index ${indexName}`);

  const query = {
    query: {
      match: {
        firstName: {
          query: 'John',
        },
      },
    },
  };

  const response = await client.search({
    index: indexName,
    body: query,
  });

  console.log(JSON.stringify(response.body));
}

export const handler = async () => {
  const region = process.env.AOSS_REGION || 'us-east-1';
  const collectionId = process.env.AOSS_COLLECTION_ID;
  if (!collectionId) {
    throw new Error('missing collection id');
  }

  const ingestionRoleArn = process.env.INGESTION_ROLE_ARN;
  if (!ingestionRoleArn) {
    throw new Error('missing ingestion role arn');
  }

  const ingestionRoleExternalId = process.env.INGESTION_ROLE_EXTERNAL_ID;
  if (!ingestionRoleExternalId) {
    throw new Error('missing ingestion role external id');
  }

  const index = 'user-metadata';
  const client = createClient(region, collectionId, ingestionRoleArn, ingestionRoleExternalId);
  await createIndex(client, index);
  await indexSampleData(client, index);
  await searchSampleData(client, index);
};
