const { post } = require('axios');

const { getHeaders } = require('./headers');
const { responseData } = require('./response-data');

async function createGvar(value) {
  const response = await post(
    'https://api.avrae.io/customizations/gvars',
    { value },
    { headers: getHeaders() },
  );

  return responseData(response);
}

module.exports = { createGvar };
