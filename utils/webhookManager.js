const webhookCache = new Map();

async function getWebhookForChannel(channel) {
  if (webhookCache.has(channel.id)) {
    return webhookCache.get(channel.id);
  }

  const webhooks = await channel.fetchWebhooks();
  let webhook = webhooks.find(
    w => w.owner?.id === channel.client.user.id
  );

  if (!webhook) {
    webhook = await channel.createWebhook({
      name: 'KuchBhi Say-As',
      reason: 'Say-as impersonation feature'
    });
  }

  webhookCache.set(channel.id, webhook);
  return webhook;
}

module.exports = { getWebhookForChannel };
