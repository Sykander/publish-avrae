const { post, put } = require('axios');
const { getHeaders } = require('./headers');

async function updateSnippet(id, content) {
  await post(`https://api.avrae.io/workshop/snippet/${id}/code`, content, {
    headers: getHeaders(),
  });

  if (content.is_current) {
    return put(
      `https://api.avrae.io/workshop/snippet/${id}/active-code`,
      { version: content.version },
      { headers: getHeaders() },
    );
  }
}
module.exports = { updateSnippet };
