// Dependency-free self-check for the email-delivery work:
// transport selection, the bounded SMTP timeouts, the HTTPS request shape for
// Resend / Brevo, and the real send path pointed at a LOCAL STUB.
//
// Run with:  npm run selfcheck:email
//
// No real email is ever sent. Every network send in this file goes to an
// ephemeral HTTP server on 127.0.0.1 that captures the request and answers
// with a canned status.
//
// Prints one PASS/FAIL line per case and exits non-zero if any case fails.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import http from "node:http";

const require = createRequire(import.meta.url);

const backendPath = (...parts) =>
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "backend",
    ...parts
  );

const {
  chooseEmailTransport,
  parseAddress,
  buildEmailRequest,
  buildSmtpOptions,
  sendOtpEmail,
  MailDeliveryError,
  SEND_DEADLINE_MS,
  SMTP_CONNECTION_TIMEOUT_MS,
  SMTP_GREETING_TIMEOUT_MS,
  SMTP_SOCKET_TIMEOUT_MS,
} = require(backendPath("utils", "mailer.js"));

let passed = 0;
let failed = 0;

const case_ = async (name, fn) => {
  try {
    await fn();

    passed += 1;

    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;

    console.log(`FAIL  ${name}`);
    console.log(`      ${error.message}`);
  }
};

const assertEqual = (actual, expected, label = "value") => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);

  if (a !== b) {
    throw new Error(`${label}: expected ${b}, received ${a}`);
  }
};

const assertTrue = (value, label = "value") => {
  if (!value) throw new Error(`${label}: expected a truthy value`);
};

const assertFalse = (value, label = "value") => {
  if (value) throw new Error(`${label}: expected a falsy value`);
};

/* ------------------------------------------------------------------
   Env isolation
------------------------------------------------------------------ */

const ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "EMAIL_FROM",
  "RESEND_API_KEY",
  "BREVO_API_KEY",
  "RESEND_BASE_URL",
  "BREVO_BASE_URL",
  "ALLOW_DEV_OTP",
  "NODE_ENV",
];

// Runs fn with exactly `vars` set on process.env (every other key in
// ENV_KEYS removed), then restores the previous environment.
const withEnv = async (vars, fn) => {
  const saved = new Map();

  for (const key of ENV_KEYS) {
    saved.set(key, process.env[key]);

    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

// Silences the mailer's DEV MAIL / MAIL ERROR logging so the PASS/FAIL lines
// stay readable. Deliberate: the log lines are expected here.
const quiet = async (fn) => {
  const log = console.log;
  const error = console.error;

  console.log = () => {};
  console.error = () => {};

  try {
    return await fn();
  } finally {
    console.log = log;
    console.error = error;
  }
};

/* ------------------------------------------------------------------
   Local HTTP stub
------------------------------------------------------------------ */

const startStub = (status = 200) =>
  new Promise((resolve) => {
    const captured = [];

    const server = http.createServer((req, res) => {
      let raw = "";

      req.on("data", (chunk) => {
        raw += chunk;
      });

      req.on("end", () => {
        let body = null;

        try {
          body = JSON.parse(raw);
        } catch {
          body = null;
        }

        captured.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body,
        });

        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: status < 400 }));
      });
    });

    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        captured,
        origin: `http://127.0.0.1:${server.address().port}`,
      });
    });
  });

const stopStub = (server) =>
  new Promise((resolve) => server.close(resolve));

const SMTP_ENV = {
  SMTP_HOST: "smtp.example.invalid",
  SMTP_PORT: "587",
  SMTP_USER: "mailer@example.invalid",
  SMTP_PASS: "not-a-real-password",
  SMTP_FROM: "BrainRace <mailer@example.invalid>",
};

const OTP = "123456";

const EXPECTED_TEXT =
  `Your BrainRace verification code is:\n\n` +
  `  ${OTP}\n\n` +
  `It expires in 10 minutes. If you did not request this, ignore this email.`;

/* ------------------------------------------------------------------
   A — TRANSPORT SELECTION
------------------------------------------------------------------ */

console.log("");
console.log("BrainRace selfcheck: email delivery");
console.log("===================================");
console.log("");

console.log("-- chooseEmailTransport --");

await case_("nothing configured selects none", () => {
  assertEqual(chooseEmailTransport({}), "none", "transport");
});

await case_("SMTP only selects smtp", () => {
  assertEqual(chooseEmailTransport(SMTP_ENV), "smtp", "transport");
});

await case_(
  "a Resend key alongside SMTP wins (HTTP works where SMTP is blocked)",
  () => {
    assertEqual(
      chooseEmailTransport({ ...SMTP_ENV, RESEND_API_KEY: "re_test" }),
      "resend",
      "transport"
    );
  }
);

await case_("a Brevo key alone selects brevo", () => {
  assertEqual(
    chooseEmailTransport({ BREVO_API_KEY: "xkeysib-test" }),
    "brevo",
    "transport"
  );
});

await case_(
  "both HTTP keys present: Resend wins, deterministically",
  () => {
    assertEqual(
      chooseEmailTransport({
        RESEND_API_KEY: "re_test",
        BREVO_API_KEY: "xkeysib-test",
        ...SMTP_ENV,
      }),
      "resend",
      "transport"
    );
  }
);

await case_("blank or whitespace keys are not configured", () => {
  assertEqual(
    chooseEmailTransport({ RESEND_API_KEY: "   ", BREVO_API_KEY: "" }),
    "none",
    "transport"
  );

  assertEqual(
    chooseEmailTransport({ ...SMTP_ENV, SMTP_PASS: "  " }),
    "none",
    "transport"
  );
});

/* ------------------------------------------------------------------
   B — ADDRESS PARSING
------------------------------------------------------------------ */

console.log("");
console.log("-- parseAddress --");

await case_("a display-name address splits into name and email", () => {
  assertEqual(
    parseAddress("BrainRace <mailer@example.invalid>"),
    { name: "BrainRace", email: "mailer@example.invalid" },
    "address"
  );
});

await case_("a bare address yields only the email", () => {
  assertEqual(
    parseAddress("mailer@example.invalid"),
    { email: "mailer@example.invalid" },
    "address"
  );
});

/* ------------------------------------------------------------------
   C — BOUNDED SMTP TIMEOUTS
------------------------------------------------------------------ */

console.log("");
console.log("-- buildSmtpOptions --");

await case_("the transporter carries every explicit timeout", () => {
  const options = buildSmtpOptions(SMTP_ENV);

  assertEqual(options.connectionTimeout, SMTP_CONNECTION_TIMEOUT_MS, "connection");
  assertEqual(options.greetingTimeout, SMTP_GREETING_TIMEOUT_MS, "greeting");
  assertEqual(options.socketTimeout, SMTP_SOCKET_TIMEOUT_MS, "socket");

  assertTrue(
    SMTP_CONNECTION_TIMEOUT_MS > 0 &&
      SMTP_CONNECTION_TIMEOUT_MS <= 20000,
    "connectionTimeout is bounded"
  );
});

await case_("port 465 is implicit TLS, port 587 is not", () => {
  assertTrue(buildSmtpOptions({ ...SMTP_ENV, SMTP_PORT: "465" }).secure, "465");
  assertFalse(
    buildSmtpOptions({ ...SMTP_ENV, SMTP_PORT: "587" }).secure,
    "587"
  );
});

await case_("every SMTP phase and the overall deadline sit under 20s", () => {
  const phases = {
    connection: SMTP_CONNECTION_TIMEOUT_MS,
    greeting: SMTP_GREETING_TIMEOUT_MS,
    socket: SMTP_SOCKET_TIMEOUT_MS,
  };

  for (const [phase, value] of Object.entries(phases)) {
    assertTrue(
      value > 0 && value < 20000,
      `${phase} timeout (${value}ms) is bounded`
    );
  }

  // The per-phase timeouts bound each step; SEND_DEADLINE_MS is the hard
  // ceiling on the whole attempt, so it is what actually caps the wait.
  assertTrue(SEND_DEADLINE_MS > 0, "send deadline is set");
  assertTrue(
    SEND_DEADLINE_MS <= phases.connection + phases.greeting,
    `send deadline (${SEND_DEADLINE_MS}ms) caps the attempt`
  );
  assertTrue(
    SEND_DEADLINE_MS < 20000,
    `send deadline (${SEND_DEADLINE_MS}ms) is well under 20s`
  );
});

/* ------------------------------------------------------------------
   D — REQUEST SHAPE (no network)
------------------------------------------------------------------ */

console.log("");
console.log("-- buildEmailRequest --");

const MESSAGE = {
  to: "student@example.invalid",
  subject: "Verify your BrainRace account",
  text: EXPECTED_TEXT,
};

await case_("the Resend request is a JSON POST with a bearer key", () => {
  const request = buildEmailRequest("resend", { RESEND_API_KEY: "re_test" }, MESSAGE);

  assertEqual(request.method, "POST", "method");
  assertEqual(request.url, "https://api.resend.com/emails", "url");
  assertEqual(
    request.headers.Authorization,
    "Bearer re_test",
    "authorization"
  );
  assertEqual(
    request.headers["Content-Type"],
    "application/json",
    "content-type"
  );
  assertEqual(request.body.to, ["student@example.invalid"], "to");
  assertEqual(request.body.subject, MESSAGE.subject, "subject");
  assertEqual(request.body.text, EXPECTED_TEXT, "text");
  assertTrue(request.body.from.includes("BrainRace"), "from is branded");
});

await case_("the Brevo request carries sender, to and textContent", () => {
  const request = buildEmailRequest(
    "brevo",
    { BREVO_API_KEY: "xkeysib-test", EMAIL_FROM: "BrainRace <from@example.invalid>" },
    MESSAGE
  );

  assertEqual(request.url, "https://api.brevo.com/v3/smtp/email", "url");
  assertEqual(request.headers["api-key"], "xkeysib-test", "api-key");
  assertEqual(
    request.body.sender,
    { name: "BrainRace", email: "from@example.invalid" },
    "sender"
  );
  assertEqual(request.body.to, [{ email: "student@example.invalid" }], "to");
  assertEqual(request.body.subject, MESSAGE.subject, "subject");
  assertEqual(request.body.textContent, EXPECTED_TEXT, "textContent");
});

await case_("a BASE_URL override redirects the request to the stub", () => {
  const request = buildEmailRequest(
    "resend",
    { RESEND_API_KEY: "re_test", RESEND_BASE_URL: "http://127.0.0.1:9999/" },
    MESSAGE
  );

  assertEqual(request.url, "http://127.0.0.1:9999/emails", "url");
});

await case_("a non-HTTP transport builds no HTTP request", () => {
  assertEqual(buildEmailRequest("smtp", SMTP_ENV, MESSAGE), null, "smtp");
  assertEqual(buildEmailRequest("none", {}, MESSAGE), null, "none");
});

/* ------------------------------------------------------------------
   E — REAL SEND PATH AGAINST A LOCAL STUB
------------------------------------------------------------------ */

console.log("");
console.log("-- sendOtpEmail against a local stub --");

await case_(
  "Resend key + SMTP configured: the stub receives the HTTPS send",
  async () => {
    const stub = await startStub(200);

    try {
      const result = await withEnv(
        {
          ...SMTP_ENV,
          RESEND_API_KEY: "re_test",
          RESEND_BASE_URL: stub.origin,
          EMAIL_FROM: "BrainRace <from@example.invalid>",
        },
        () =>
          quiet(() =>
            sendOtpEmail("student@example.invalid", OTP, "register")
          )
      );

      assertEqual(result, { delivered: true }, "result");
      assertEqual(stub.captured.length, 1, "one request captured");

      const request = stub.captured[0];

      assertEqual(request.method, "POST", "method");
      assertEqual(request.url, "/emails", "path");
      assertEqual(
        request.headers.authorization,
        "Bearer re_test",
        "authorization header"
      );
      assertEqual(
        request.headers["content-type"],
        "application/json",
        "content-type header"
      );
      assertEqual(request.body.to, ["student@example.invalid"], "to");
      assertEqual(
        request.body.subject,
        "Verify your BrainRace account",
        "subject"
      );
      assertEqual(request.body.text, EXPECTED_TEXT, "text matches the SMTP body");
    } finally {
      await stopStub(stub.server);
    }
  }
);

await case_(
  "Brevo key alone: the stub receives Brevo's JSON shape",
  async () => {
    const stub = await startStub(200);

    try {
      const result = await withEnv(
        {
          BREVO_API_KEY: "xkeysib-test",
          BREVO_BASE_URL: stub.origin,
          EMAIL_FROM: "BrainRace <from@example.invalid>",
        },
        () =>
          quiet(() =>
            sendOtpEmail("student@example.invalid", OTP, "reset")
          )
      );

      assertEqual(result, { delivered: true }, "result");
      assertEqual(stub.captured.length, 1, "one request captured");

      const request = stub.captured[0];

      assertEqual(request.url, "/v3/smtp/email", "path");
      assertEqual(
        request.headers["api-key"],
        "xkeysib-test",
        "api-key header"
      );
      assertEqual(
        request.body.subject,
        "Reset your BrainRace password",
        "subject"
      );
      assertEqual(request.body.textContent, EXPECTED_TEXT, "textContent");
    } finally {
      await stopStub(stub.server);
    }
  }
);

await case_(
  "a provider rejection becomes MailDeliveryError EMAIL_SEND_FAILED / 503",
  async () => {
    const stub = await startStub(500);

    try {
      let caught = null;

      await withEnv(
        { RESEND_API_KEY: "re_test", RESEND_BASE_URL: stub.origin },
        () =>
          quiet(async () => {
            try {
              await sendOtpEmail("student@example.invalid", OTP, "register");
            } catch (error) {
              caught = error;
            }
          })
      );

      assertTrue(caught instanceof MailDeliveryError, "MailDeliveryError");
      assertEqual(caught.code, "EMAIL_SEND_FAILED", "code");
      assertEqual(caught.status, 503, "status");
    } finally {
      await stopStub(stub.server);
    }
  }
);

await case_(
  "no transport configured resolves not_configured without any network call",
  async () => {
    const result = await withEnv({}, () =>
      quiet(() => sendOtpEmail("student@example.invalid", OTP, "register"))
    );

    assertEqual(
      result,
      { delivered: false, reason: "not_configured" },
      "result"
    );
  }
);

/* ------------------------------------------------------------------
   RESULT
------------------------------------------------------------------ */

console.log("");
console.log("===================================");
console.log(`${passed} passed, ${failed} failed`);
console.log("");

if (failed > 0) {
  process.exit(1);
}

process.exit(0);
