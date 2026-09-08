const assert = require('assert');

async function runVerificationSuite() {
  console.log('===============================================================');
  console.log('🧪 Starting PromptGround Self-Hosted Engine Integration Test Suite');
  console.log('===============================================================\n');

  const BASE_URL = 'http://localhost:8080';
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`  ▶ Testing: ${name}... `);
    try {
      await fn();
      console.log('✅ PASSED');
      passed++;
    } catch (err) {
      console.log(`❌ FAILED: ${err.message}`);
      console.error(err);
      failed++;
    }
  }

  // 1. Health & Monolithic Static File Serving
  await test('Health check and SQLite WAL status', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'healthy');
    assert.strictEqual(data.database, 'SQLite WAL');
    assert.strictEqual(data.cacheHydrated, true);
    assert(data.activeCachedPrompts > 0, 'Should have active cached prompts');
    assert(data.activeApiKeys > 0, 'Should have active cached API keys');
  });

  await test('Monolithic single-container static UI delivery', async () => {
    const res = await fetch(`${BASE_URL}/`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert(html.includes('PromptGround') || html.includes('root'), 'Should serve React SPA HTML');
  });

  // 2. High-Throughput Sub-Millisecond Runtime Fetch
  await test('Sub-millisecond runtime prompt template retrieval (In-Memory Map Cache)', async () => {
    const start = process.hrtime.bigint();
    const res = await fetch(`${BASE_URL}/api/v1/runtime/prompts/customer-support-copilot?env=production`, {
      headers: {
        'Authorization': 'Bearer ph_live_testkey_abcdef'
      }
    });
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('x-cache'), 'HIT');
    const data = await res.json();
    assert.strictEqual(data.slug, 'customer-support-copilot');
    assert.strictEqual(data.environment, 'production');
    assert.strictEqual(data.version, 1);
    assert(data.templateContent.includes('Acme Cloud'));
    console.log(`\n     [Metric] End-to-end network latency: ${durationMs.toFixed(3)}ms (In-Memory Lookup: ${data.lookupLatencyMicroseconds}µs)`);
  });

  // 3. High-Throughput Sub-Millisecond Template Interpolation
  await test('Runtime template variable interpolation (Zero Disk I/O)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/runtime/render/customer-support-copilot?env=production`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ph_live_testkey_abcdef',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        variables: {
          customer_name: 'Acme Enterprise',
          account_tier: 'Enterprise VIP',
          issue_category: 'Webhook Delivery 500',
          conversation_history: 'Webhook retries exhausted after 5 attempts.'
        }
      })
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('x-cache'), 'HIT');
    const data = await res.json();
    assert(data.rendered.includes('Customer: Acme Enterprise'));
    assert(data.rendered.includes('Account Tier: Enterprise VIP'));
    assert.strictEqual(data.durationMicroseconds !== undefined, true);
    console.log(`\n     [Metric] Interpolation render duration: ${data.durationMicroseconds}µs`);
  });

  // 4. Scoped API Key Authorization & RBAC Enforcement
  await test('Enforce API Key environment scoping (Reject production key on staging)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/runtime/prompts/customer-support-copilot?env=staging`, {
      headers: {
        'Authorization': 'Bearer ph_live_testkey_abcdef' // production key
      }
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.error, 'Scope mismatch');
  });

  await test('Reject invalid/revoked API keys', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/runtime/prompts/customer-support-copilot?env=production`, {
      headers: {
        'Authorization': 'Bearer ph_invalid_fake_key_123'
      }
    });
    assert.strictEqual(res.status, 401);
  });

  // 5. Promotion Pull Request Lifecycle & In-Memory Cache Invalidation
  await test('Promotion PR side-by-side diff inspection and atomic merge', async () => {
    // 1. Admin login to get JWT
    const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    assert.strictEqual(loginRes.status, 200);
    const { token } = await loginRes.json();

    // 2. Fetch or create an open PR
    let prsRes = await fetch(`${BASE_URL}/api/v1/pull-requests?status=open`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(prsRes.status, 200);
    let prsData = await prsRes.json();
    let targetPR = prsData.pullRequests?.[0];

    if (!targetPR) {
      // Create a test PR
      const promptRes = await fetch(`${BASE_URL}/api/v1/prompts/customer-support-copilot`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const promptData = await promptRes.json();
      const createPRRes = await fetch(`${BASE_URL}/api/v1/pull-requests`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt_id: promptData.prompt.id,
          source_version_id: promptData.versions[0].id,
          target_environment: 'staging',
          title: 'Automated Idempotent Promotion PR'
        })
      });
      assert.strictEqual(createPRRes.status, 201);
      const newPR = await createPRRes.json();
      targetPR = { id: newPR.pullRequestId };
    }

    // 3. Inspect diff
    const diffRes = await fetch(`${BASE_URL}/api/v1/pull-requests/${targetPR.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(diffRes.status, 200);
    const diffData = await diffRes.json();
    assert(diffData.diff.length > 0, 'Should have computed diff array');

    // 4. Merge the PR
    const mergeRes = await fetch(`${BASE_URL}/api/v1/pull-requests/${targetPR.id}/merge`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(mergeRes.status, 200);
    const mergeData = await mergeRes.json();
    assert.strictEqual(mergeData.success, true);
    assert.strictEqual(mergeData.promotedToEnvironment, 'staging');

    // 5. Verify In-Memory Cache immediately reflects the promoted version in staging!
    const updatedRuntimeRes = await fetch(`${BASE_URL}/api/v1/runtime/prompts/customer-support-copilot?env=staging`, {
      headers: {
        'Authorization': 'Bearer ph_stg_testkey_67890'
      }
    });
    assert.strictEqual(updatedRuntimeRes.status, 200);
    const updatedStaging = await updatedRuntimeRes.json();
    assert.strictEqual(updatedStaging.version, mergeData.newVersionNumber);
    assert(updatedStaging.templateContent.includes('Strict Instructions') || updatedStaging.templateContent.includes('escalation'), 'Staging active cache should immediately reflect promoted v3 template');
  });

  // 6. Access Control & Granular Overrides
  await test('User environment permission matrix check', async () => {
    // Login as alex_analyst (viewer, only development access)
    const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alex_analyst', password: 'viewer123' })
    });
    assert.strictEqual(loginRes.status, 200);
    const { token, user } = await loginRes.json();
    assert.strictEqual(user.role, 'viewer');
    assert.deepStrictEqual(user.environments, ['development']);

    // Attempting direct version write as viewer should be rejected
    const writeRes = await fetch(`${BASE_URL}/api/v1/prompts/customer-support-copilot/versions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        templateContent: 'Malicious modification',
        environment: 'production'
      })
    });
    assert.strictEqual(writeRes.status, 403);
  });

  // 7. Connected LLM Models & Test Playground Execution
  await test('Connected LLM Models listing and Admin creation', async () => {
    // Admin token
    const adminLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const { token: adminToken } = await adminLogin.json();

    // List models
    const modelsRes = await fetch(`${BASE_URL}/api/v1/models`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(modelsRes.status, 200);
    const modelsData = await modelsRes.json();
    assert(Array.isArray(modelsData.models), 'Should return models list');

    // Create a custom model connection as admin
    const createModRes = await fetch(`${BASE_URL}/api/v1/models`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Automated Test Ollama Runner',
        provider_type: 'ollama',
        base_url: 'http://localhost:11434',
        model_id: 'llama3.2:1b',
        custom_headers: { 'X-Test-Suite': 'PromptGround-Automated' },
        default_params: { temperature: 0.1 }
      })
    });
    assert.strictEqual(createModRes.status, 201);
    const createdModel = await createModRes.json();

    // Test playground execution with connected model
    const execRes = await fetch(`${BASE_URL}/api/v1/runtime/execute/customer-support-copilot?env=development`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        variables: {
          customer_name: 'TestCorp',
          account_tier: 'Pro Tier',
          issue_category: 'Model Gateway Test',
          conversation_history: 'Testing model invocation in playground.'
        },
        modelId: createdModel.modelId,
        options: { temperature: 0.2, maxTokens: 500 }
      })
    });
    assert.strictEqual(execRes.status, 200);
    const execData = await execRes.json();
    assert(execData.hydratedPrompt.includes('Customer Name: TestCorp') || execData.hydratedPrompt.includes('TestCorp'));
    assert(execData.modelOutput.length > 0, 'Should return model output');
    assert(execData.modelLatencyMs !== undefined);
    console.log(`\n     [Metric] Model response received: ${execData.modelLatencyMs}ms from ${execData.providerName}`);
  });

  // 8. Self-Service and Admin Password Reset
  await test('Self-service password change and Admin password reset', async () => {
    // 1. Viewer self-service change password
    const viewerLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alex_analyst', password: 'viewer123' })
    });
    const { token: viewerToken, user: viewerUser } = await viewerLogin.json();

    const changePwRes = await fetch(`${BASE_URL}/api/v1/auth/password`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${viewerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        currentPassword: 'viewer123',
        newPassword: 'new_viewer_password_456'
      })
    });
    assert.strictEqual(changePwRes.status, 200);

    // Verify new password works
    const relogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alex_analyst', password: 'new_viewer_password_456' })
    });
    assert.strictEqual(relogin.status, 200);

    // 2. Admin directly resets viewer password back
    const adminLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const { token: adminToken } = await adminLogin.json();

    const adminResetRes = await fetch(`${BASE_URL}/api/v1/users/${viewerUser.id}/password`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        newPassword: 'viewer123'
      })
    });
    assert.strictEqual(adminResetRes.status, 200);
  });

  // 9. SMTP Email Configuration & Verification Test
  await test('Admin SMTP email notification configuration and test dispatch', async () => {
    const adminLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const { token: adminToken } = await adminLogin.json();

    // Fetch SMTP config
    const getSmtpRes = await fetch(`${BASE_URL}/api/v1/settings/smtp`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(getSmtpRes.status, 200);
    const smtpData = await getSmtpRes.json();
    assert(smtpData.smtp.host);

    // Test send email endpoint
    const testMailRes = await fetch(`${BASE_URL}/api/v1/settings/smtp/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipientEmail: 'devops-lead@company.internal'
      })
    });
    assert.strictEqual(testMailRes.status, 200);
    const mailResult = await testMailRes.json();
    assert.strictEqual(mailResult.success, true);
    console.log(`\n     [SMTP] ${mailResult.message}`);
  });

  // 10. Strict RBAC Isolation for Non-Admins
  await test('Strict RBAC: non-admins cannot access SMTP settings or create API keys', async () => {
    const editorLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sarah_eng', password: 'editor123' })
    });
    const { token: editorToken } = await editorLogin.json();

    // Editor cannot fetch SMTP settings
    const smtpRes = await fetch(`${BASE_URL}/api/v1/settings/smtp`, {
      headers: { 'Authorization': `Bearer ${editorToken}` }
    });
    assert.strictEqual(smtpRes.status, 403);

    // Editor cannot generate API keys
    const createKeyRes = await fetch(`${BASE_URL}/api/v1/api-keys`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${editorToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Unauthorized Key', environment: 'development' })
    });
    assert.strictEqual(createKeyRes.status, 403);
  });

  // 11. Security Audit: Unassigned Dev Editor Cannot See Prompts, Raise PRs, or Merge
  await test('Security Audit: Dev editor with no prompt assignments is strictly isolated', async () => {
    // 1. Admin creates a new dev editor with only 'development' env and no prompt assignment
    const adminLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const { token: adminToken } = await adminLogin.json();

    const username = `dev_editor_${Date.now()}`;
    const createUserRes = await fetch(`${BASE_URL}/api/v1/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username,
        password: 'EditorPassword!123',
        role: 'editor',
        environments: ['development']
      })
    });
    assert.strictEqual(createUserRes.status, 201);

    // 2. Dev editor logs in
    const devLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'EditorPassword!123' })
    });
    assert.strictEqual(devLogin.status, 200);
    const { token: devToken } = await devLogin.json();

    // 3. Dev editor fetches prompts - MUST NOT see unassigned prompts
    const promptsRes = await fetch(`${BASE_URL}/api/v1/prompts`, {
      headers: { 'Authorization': `Bearer ${devToken}` }
    });
    assert.strictEqual(promptsRes.status, 200);
    const { prompts } = await promptsRes.json();
    assert.strictEqual(prompts.length, 0, 'Unassigned user should see 0 prompts');

    // 4. Dev editor tries to view an unassigned prompt directly -> 403 Forbidden
    const singlePromptRes = await fetch(`${BASE_URL}/api/v1/prompts/customer-support-copilot`, {
      headers: { 'Authorization': `Bearer ${devToken}` }
    });
    assert.strictEqual(singlePromptRes.status, 403, 'Direct prompt fetch should be 403 Forbidden');

    // 5. Dev editor tries to fetch runtime prompt directly with user token -> 403 Forbidden
    const runtimePromptRes = await fetch(`${BASE_URL}/api/v1/runtime/prompts/customer-support-copilot?env=development`, {
      headers: { 'Authorization': `Bearer ${devToken}` }
    });
    assert.strictEqual(runtimePromptRes.status, 403, 'Runtime fetch without prompt access should be 403');

    // 6. Dev editor tries to raise a promotion PR for unassigned prompt -> 403 Forbidden
    const prCreateRes = await fetch(`${BASE_URL}/api/v1/pull-requests`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${devToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt_id: 'prm_cust_supp_01',
        source_version_id: 'ver_dev_01',
        target_environment: 'staging',
        title: 'Unauthorized promotion attempt'
      })
    });
    assert.strictEqual(prCreateRes.status, 403, 'Raising PR without write access should be 403');

    // 7. Dev editor fetches pull requests -> MUST NOT see PRs for unassigned prompts
    const prsListRes = await fetch(`${BASE_URL}/api/v1/pull-requests`, {
      headers: { 'Authorization': `Bearer ${devToken}` }
    });
    assert.strictEqual(prsListRes.status, 200);
    const { pullRequests } = await prsListRes.json();
    assert.strictEqual(pullRequests.length, 0, 'Unassigned user should see 0 pull requests');

    // 8. Dev editor tries to merge an open PR into staging/prod -> 403 Forbidden
    const adminPrsRes = await fetch(`${BASE_URL}/api/v1/pull-requests?status=open`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const { pullRequests: adminPrs } = await adminPrsRes.json();
    if (adminPrs.length > 0) {
      const targetPr = adminPrs[0];
      const mergeRes = await fetch(`${BASE_URL}/api/v1/pull-requests/${targetPr.id}/merge`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${devToken}` }
      });
      assert.strictEqual(mergeRes.status, 403, 'Merging PR without authorization must return 403');
    }

    // 9. Dev editor tries to fetch scoped API keys -> 403 Forbidden
    const apiKeysRes = await fetch(`${BASE_URL}/api/v1/api-keys`, {
      headers: { 'Authorization': `Bearer ${devToken}` }
    });
    assert.strictEqual(apiKeysRes.status, 403, 'Fetching API keys as non-admin must return 403');
  });

  console.log('\n===============================================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runVerificationSuite().catch(e => {
  console.error(e);
  process.exit(1);
});
