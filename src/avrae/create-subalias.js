const { post } = require('./http-client');

const { getHeaders } = require('./headers');
const { responseData } = require('./response-data');

async function createSubalias(aliasId, { name, docs = '' }) {
  const response = await post(
    `https://api.avrae.io/workshop/alias/${aliasId}/alias`,
    { name, docs },
    { headers: getHeaders() },
  );

  return responseData(response);
}

module.exports = { createSubalias };
