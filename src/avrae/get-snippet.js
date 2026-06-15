const { get } = require('./http-client');
const { getHeaders } = require('./headers');

async function getSnippet(id) {
  const {
    data: { data },
  } = await get(`https://api.avrae.io/workshop/snippet/${id}/code`, {
    headers: getHeaders(),
  });

  return data;
}
module.exports = { getSnippet };
