const { post, put } = require('axios');
const { getHeaders } = require('./headers');

async function updateAlias(id, content) {
  await post(`https://api.avrae.io/workshop/alias/${id}/code`, content, {
    headers: getHeaders(),
  });

  if (content.is_current) {
    await put(
      `https://api.avrae.io/workshop/alias/${id}/active-code`,
      { version: content.version },
      { headers: getHeaders() },
    );
  }
}

module.exports = { updateAlias };
