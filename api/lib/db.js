import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  QueryCommand,
  PutCommand,
  UpdateCommand,
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
 * Update a post by id. Null/empty string values REMOVE the attribute; all others SET it.
 * items is always SET (even if empty array).
 * Returns the updated item.
 * @param {string} id
 * @param {object} fields - map of attribute name to new value
 * @returns {Promise<object|null>}
 */
export async function updatePost(id, fields) {
  const setExpressions = [];
  const removeExpressions = [];
  const names = {};
  const values = {};

  for (const [key, value] of Object.entries(fields)) {
    const nameAlias = `#f_${key}`;
    names[nameAlias] = key;

    const isNullish = value === null || value === undefined || value === '';
    const isEmptyArray = Array.isArray(value) && value.length === 0;

    if (isNullish && !isEmptyArray) {
      removeExpressions.push(nameAlias);
    } else {
      const valueAlias = `:v_${key}`;
      values[valueAlias] = value;
      setExpressions.push(`${nameAlias} = ${valueAlias}`);
    }
  }

  let updateExpression = '';
  if (setExpressions.length > 0) {
    updateExpression += 'SET ' + setExpressions.join(', ');
  }
  if (removeExpressions.length > 0) {
    if (updateExpression) updateExpression += ' ';
    updateExpression += 'REMOVE ' + removeExpressions.join(', ');
  }

  const params = {
    TableName: TABLE_NAME,
    Key: { id },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: names,
  };
  if (Object.keys(values).length > 0) {
    params.ExpressionAttributeValues = values;
  }

  await ddb.send(new UpdateCommand(params));
  return getById(id);
}

/**
 * Query all posts for a given calendar year via DateIndex GSI, descending by postdate.
 * Uses a BETWEEN condition on the sort key so only that year's items are read.
 * @param {string|number} year - e.g. 2024
 * @returns {Promise<object[]>}
 */
export async function queryByYear(year) {
  const items = [];
  let lastKey;

  do {
    const params = {
      TableName: TABLE_NAME,
      IndexName: 'DateIndex',
      KeyConditionExpression: '#t = :type AND #d BETWEEN :start AND :end',
      ExpressionAttributeNames: { '#t': '_type', '#d': 'postdate' },
      ExpressionAttributeValues: {
        ':type': 'POST',
        ':start': `${year}-01-01`,
        ':end':   `${year}-12-31`,
      },
      ScanIndexForward: false,
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
 * Scan all posts to find the current maximum numeric id, then return max+1 as a string.
 * Single-user app; no concurrency risk.
 * @returns {Promise<string>}
 */
export async function nextPostId() {
  const items = await scanAll();
  let max = 0;
  for (const item of items) {
    const n = parseInt(item.id, 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return String(max + 1);
}

/**
 * Insert a new post. Fails if an item with the same id already exists.
 * @param {object} post - fully-formed post item (must include id, _type, postdate, monthday)
 * @returns {Promise<object>} the post as written
 */
export async function createPost(post) {
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: post,
    ConditionExpression: 'attribute_not_exists(id)',
  }));
  return post;
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
