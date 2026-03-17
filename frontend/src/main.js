async function loadGatewayState() {
  const [healthResponse, configResponse] = await Promise.all([
    fetch("/healthz"),
    fetch("/config"),
  ]);

  const health = await healthResponse.json();
  const config = await configResponse.json();

  const healthOk = health.status === "ok";
  document.getElementById("health-text").textContent = healthOk ? "Online" : "Unhealthy";
  document.getElementById("health-badge").textContent = healthOk ? "Healthy" : "Issue";
  document.getElementById("endpoint-text").textContent = config.vllm_endpoint;
  document.getElementById("api-key-text").textContent = config.has_api_key ? "Configured" : "Not set";
}

loadGatewayState().catch(() => {
  document.getElementById("health-text").textContent = "Unavailable";
  document.getElementById("health-badge").textContent = "Offline";
  document.getElementById("endpoint-text").textContent = "Could not load config";
  document.getElementById("api-key-text").textContent = "Unknown";
});
