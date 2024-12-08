const { post, put } = require("axios");
const { headers } = require("./headers");

async function updateSnippet(id, content) {
  await post(`https://api.avrae.io/workshop/snippet/${id}/code`, content, {
    headers,
  });

  if (content.is_current) {
    return put(
      `https://api.avrae.io/workshop/snippet/${id}/active-code`,
      { version: content.version },
      { headers },
    );
  }
}
module.exports = { updateSnippet };
