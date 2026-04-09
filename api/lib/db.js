import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.DYNAMODB_TABLE;

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

/**
 * Full table scan with automatic pagination.
 * @returns {Promise<object[]>} all items in the table
 */
export async function scanAll() {
  const items = [];
  let lastKey;

  do {
    const params = {
      TableName: TABLE_NAME,
    };
    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }

    const result = await ddb.send(new ScanCommand(params));
    if (result.Items) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

/**
 * Get a single item by its primary key id.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getById(id) {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { id },
    })
  );
  return result.Item || null;
}

/**
 * Query all posts via DateIndex GSI, sorted by postdate.
 * @param {boolean} ascending - sort direction (default false = descending)
 * @returns {Promise<object[]>}
 */
export async function queryByDate(ascending = false) {
  const items = [];
  let lastKey;

  do {
    const params = {
      TableName: TABLE_NAME,
      IndexName: 'DateIndex',
      KeyConditionExpression: '#t = :type',
      ExpressionAttributeNames: { '#t': '_type' },
      ExpressionAttributeValues: { ':type': 'POST' },
      ScanIndexForward: ascending,
    };
    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }

    const result = await ddb.send(new QueryCommand(params));
    if (result.Items) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

/**
 * Query posts by monthday (MM-DD) via MonthDayIndex GSI, ascending by postdate.
 * @param {string} monthday - e.g. "04-02"
 * @returns {Promise<object[]>}
 */
export async function queryByMonthDay(monthday) {
  const items = [];
  let lastKey;

  do {
    const params = {
      TableName: TABLE_NAME,
      IndexName: 'MonthDayIndex',
      KeyConditionExpression: 'monthday = :md',
      ExpressionAttributeValues: { ':md': monthday },
      ScanIndexForward: true,
    };
    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }

    const result = await ddb.send(new QueryCommand(params));
    if (result.Items) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}
