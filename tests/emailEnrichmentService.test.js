import test from 'node:test';
import assert from 'node:assert/strict';
import EmailEnrichmentService from '../src/services/emailEnrichmentService.js';

function response(html, contentType = 'text/html') {
  return {
    ok: true,
    status: 200,
    headers: { get: () => contentType },
    text: async () => html
  };
}

test('enrichLeads finds an email on the business website', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url.toString());
    return response('<a href="mailto:hello@examplecafe.ca">Email us</a>');
  };
  const service = new EmailEnrichmentService({ fetchImpl });

  const leads = await service.enrichLeads([
    { business_name: 'Example Cafe', website: 'https://examplecafe.ca', email: null }
  ]);

  assert.equal(leads[0].email, 'hello@examplecafe.ca');
  assert.equal(leads[0].email_source, 'website');
  assert.equal(calls[0], 'https://examplecafe.ca/');
});

test('enrichLeads keeps leads unchanged when no website exists', async () => {
  let called = false;
  const service = new EmailEnrichmentService({
    fetchImpl: async () => {
      called = true;
      return response('');
    }
  });
  const lead = { business_name: 'Phone Only', phone: '604-555-1234', email: null };

  const leads = await service.enrichLeads([lead]);

  assert.equal(called, false);
  assert.deepEqual(leads[0], lead);
});

test('enrichLeads prefers emails from the same website domain', async () => {
  const service = new EmailEnrichmentService({
    fetchImpl: async () => response('support@platform.com info@localrestaurant.ca')
  });

  const leads = await service.enrichLeads([
    { business_name: 'Local Restaurant', website: 'https://localrestaurant.ca', email: null }
  ]);

  assert.equal(leads[0].email, 'info@localrestaurant.ca');
});
