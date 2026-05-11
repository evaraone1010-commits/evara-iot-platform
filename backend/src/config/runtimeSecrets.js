const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const SECRET_KEY_MAP = {
    project_id: "FIREBASE_PROJECT_ID",
    client_email: "FIREBASE_CLIENT_EMAIL",
    private_key: "FIREBASE_PRIVATE_KEY",
    database_url: "FIREBASE_DATABASE_URL",
    storage_bucket: "FIREBASE_STORAGE_BUCKET",
    jwt_secret: "JWT_SECRET",
    encryption_key: "ENCRYPTION_KEY",
    mqtt_broker_url: "MQTT_BROKER_URL",
    mqtt_username: "MQTT_USERNAME",
    mqtt_password: "MQTT_PASSWORD",
    redis_url: "REDIS_URL",
    redis_username: "REDIS_USERNAME",
    redis_password: "REDIS_PASSWORD",
    sentry_dsn: "SENTRY_DSN",
    thingspeak_api_key: "THINGSPEAK_API_KEY",
    thingspeak_api_key_himalaya: "THINGSPEAK_API_KEY_HIMALAYA",
    thingspeak_api_key_krb: "THINGSPEAK_API_KEY_KRB"
};

function normalizeSecretPayload(secretValue) {
    if (!secretValue) return {};

    if (typeof secretValue === "string") {
        return normalizeSecretPayload(JSON.parse(secretValue));
    }

    if (typeof secretValue !== "object") {
        return {};
    }

    const flattened = { ...secretValue };

    for (const [key, value] of Object.entries(secretValue)) {
        if (!(key in SECRET_KEY_MAP)) continue;
        flattened[SECRET_KEY_MAP[key]] = value;
    }

    if (flattened.firebase && typeof flattened.firebase === "object") {
        for (const [key, value] of Object.entries(flattened.firebase)) {
            flattened[`FIREBASE_${key.toUpperCase()}`] = value;
        }
        delete flattened.firebase;
    }

    return flattened;
}

async function loadRuntimeSecrets() {
    const useSecretsManager = process.env.AWS_SECRETS_MANAGER_ENABLED !== "false";
    const secretId = process.env.APP_SECRET_ID || process.env.BACKEND_SECRET_ID;

    if (!useSecretsManager || !secretId) {
        return { loaded: false, reason: "Secrets Manager disabled or secret ID missing" };
    }

    const region = process.env.AWS_REGION;
    if (!region) {
        throw new Error("AWS_REGION is required when AWS Secrets Manager is enabled.");
    }

    const client = new SecretsManagerClient({ region });
    const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
    const secretString = response.SecretString
        || (response.SecretBinary ? Buffer.from(response.SecretBinary).toString("utf8") : "");

    if (!secretString) {
        throw new Error(`Secrets Manager secret ${secretId} returned an empty payload.`);
    }

    const secretData = normalizeSecretPayload(secretString);

    for (const [key, value] of Object.entries(secretData)) {
        if (value == null || value === "") continue;

        const envKey = key.toUpperCase();
        if (process.env[envKey] === undefined || process.env[envKey] === "") {
            process.env[envKey] = typeof value === "string" ? value : JSON.stringify(value);
        }
    }

    if (process.env.NODE_ENV === "production") {
        process.env.RUNTIME_SECRETS_SOURCE = `aws-secrets-manager:${secretId}`;
    }

    return { loaded: true, secretId, region };
}

module.exports = { loadRuntimeSecrets };