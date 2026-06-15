const { get } = require('axios');
const { getHeaders } = require('./headers');

async function getAlias(id) {
  const {
    data: { data },
  } = await get(`https://api.avrae.io/workshop/alias/${id}/code`, {
    headers: getHeaders(),
  });

  return data;
}

module.exports = { getAlias };
