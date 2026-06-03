const X_BROWSER_AUTHORIZATION_URL = "https://twitter.com/i/oauth2/authorize";

const connectorConfig = {
  linkedin: {
    label: "LinkedIn",
    requiredEnv: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "LINKEDIN_REDIRECT_URI"],
    scopes: ["openid", "profile", "w_member_social"],
    authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    notes: "Organization posting may require approved LinkedIn Community Management access."
  },
  facebook: {
    label: "Facebook Page",
    requiredEnv: ["META_CLIENT_ID", "META_CLIENT_SECRET", "META_REDIRECT_URI"],
    scopes: ["pages_manage_posts", "pages_read_engagement", "pages_show_list"],
    notes: "Requires a Meta app, a Page you manage, and approved Page permissions."
  },
  instagram: {
    label: "Instagram",
    requiredEnv: ["META_CLIENT_ID", "META_CLIENT_SECRET", "META_REDIRECT_URI"],
    scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement"],
    notes: "Requires a Meta app, a Facebook Page, and a linked Instagram Business or Creator account."
  },
  threads: {
    label: "Threads",
    requiredEnv: ["THREADS_CLIENT_ID", "THREADS_CLIENT_SECRET", "THREADS_REDIRECT_URI"],
    scopes: ["threads_basic", "threads_content_publish"],
    notes: "Threads can remain available later, but Instagram is the MVP Meta priority."
  },
  x: {
    label: "Twitter / X",
    requiredEnv: ["X_CLIENT_ID", "X_CLIENT_SECRET", "X_REDIRECT_URI"],
    scopes: ["tweet.read", "users.read", "offline.access"],
    authorizationUrl: X_BROWSER_AUTHORIZATION_URL,
    tokenUrl: "https://api.x.com/2/oauth2/token",
    notes: "Requires OAuth 2.0 user authentication settings in the X Developer Console."
  }
};

export function channelConfig(platform) {
  return connectorConfig[platform] || null;
}

export function channelSetup(platform) {
  const config = connectorConfig[platform];
  if (!config) {
    return {
      supported: false,
      configured: false,
      missingEnv: [],
      scopes: [],
      notes: "Unsupported platform."
    };
  }
  const hasEnv = (key) => {
    if (key === "META_CLIENT_ID") return Boolean(process.env.META_CLIENT_ID || process.env.META_APP_ID);
    if (key === "META_CLIENT_SECRET") return Boolean(process.env.META_CLIENT_SECRET || process.env.META_APP_SECRET);
    return Boolean(process.env[key]);
  };
  const missingEnv = config.requiredEnv.filter((key) => !hasEnv(key));
  return {
    supported: true,
    configured: missingEnv.length === 0,
    missingEnv,
    scopes: config.scopes,
    notes: config.notes
  };
}

export function channelSetupMessage(platform) {
  const setup = channelSetup(platform);
  if (!setup.supported) return setup.notes;
  if (!setup.configured) {
    return `OAuth app credentials are missing: ${setup.missingEnv.join(", ")}. Add them server-side, restart the app, then connect.`;
  }
  return "OAuth credentials are configured. The next step is the live OAuth redirect and callback exchange.";
}

export function publicChannelSetup(platform) {
  const setup = channelSetup(platform);
  return {
    supported: setup.supported,
    configured: setup.configured,
    missingEnv: setup.missingEnv,
    scopes: setup.scopes,
    notes: setup.notes
  };
}

export function linkedinAuthorizationUrl({ state }) {
  const config = connectorConfig.linkedin;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID || "",
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI || "",
    state,
    scope: config.scopes.join(" ")
  });
  return `${config.authorizationUrl}?${params.toString()}`;
}

export async function exchangeLinkedInCode(code) {
  const config = connectorConfig.linkedin;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: process.env.LINKEDIN_CLIENT_ID || "",
    client_secret: process.env.LINKEDIN_CLIENT_SECRET || "",
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI || ""
  });
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "LinkedIn token exchange failed.");
  }
  return payload;
}

export async function fetchLinkedInUserInfo(accessToken) {
  const response = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error_description || payload.error || "LinkedIn account lookup failed.");
  }
  return payload;
}

export function xAuthorizationUrl({ state, codeChallenge }) {
  const config = connectorConfig.x;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID || "",
    redirect_uri: process.env.X_REDIRECT_URI || "",
    state,
    scope: config.scopes.join(" "),
    code_challenge: codeChallenge || "",
    code_challenge_method: "S256"
  });
  return `${X_BROWSER_AUTHORIZATION_URL}?${params.toString()}`;
}

export async function exchangeXCode(code, codeVerifier) {
  const config = connectorConfig.x;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: process.env.X_CLIENT_ID || "",
    redirect_uri: process.env.X_REDIRECT_URI || "",
    code_verifier: codeVerifier || ""
  });
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (process.env.X_CLIENT_SECRET) {
    headers.authorization = "Basic " + Buffer.from(`${process.env.X_CLIENT_ID || ""}:${process.env.X_CLIENT_SECRET}`).toString("base64");
  }
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Twitter / X token exchange failed.");
  }
  return payload;
}

export async function fetchXUserInfo(accessToken) {
  const response = await fetch("https://api.x.com/2/users/me?user.fields=username,name", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload.errors?.[0] || payload.detail || payload.title || payload.error || {};
    throw new Error(error.detail || error.message || payload.detail || payload.title || "Twitter / X account lookup failed.");
  }
  return payload.data || payload;
}
