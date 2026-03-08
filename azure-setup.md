# SaveHydroo — Azure One-Time Setup Guide

Run these Azure CLI commands **once** to provision your infrastructure.
After this, GitHub Actions handles all future deploys automatically.

---

## Prerequisites

```bash
# Install Azure CLI (if not already installed)
# https://docs.microsoft.com/en-us/cli/azure/install-azure-cli

# Login
az login
```

---

## Step 1 — Create Resource Group

```bash
az group create \
  --name savehydroo-rg \
  --location eastus
```

---

## Step 2 — Create Azure Container Registry (ACR)

> ⚠️ The registry name must be globally unique (no hyphens allowed)

```bash
az acr create \
  --resource-group savehydroo-rg \
  --name savehydrooregistry \
  --sku Basic \
  --admin-enabled true
```

Get your ACR credentials (save these for GitHub Secrets):

```bash
az acr credential show --name savehydrooregistry
# OUTPUT → username + 2 passwords (use password[0])
# REGISTRY_LOGIN_SERVER = savehydrooregistry.azurecr.io
# REGISTRY_USERNAME     = savehydrooregistry
# REGISTRY_PASSWORD     = <password from above>
```

---

## Step 3 — Create Container App Environment

```bash
az containerapp env create \
  --name savehydroo-env \
  --resource-group savehydroo-rg \
  --location eastus
```

---

## Step 4 — Create Container App

```bash
az containerapp create \
  --name savehydroo-app \
  --resource-group savehydroo-rg \
  --environment savehydroo-env \
  --image mcr.microsoft.com/azuredocs/containerapps-helloworld:latest \
  --target-port 8080 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 3 \
  --env-vars \
    SUPABASE_URL=<your-supabase-url> \
    SUPABASE_SERVICE_KEY=<your-service-key> \
    PORT=8080
```

Get your app URL:

```bash
az containerapp show \
  --name savehydroo-app \
  --resource-group savehydroo-rg \
  --query properties.configuration.ingress.fqdn \
  --output tsv
# Example output: savehydroo-app.nicedesert-abc123.eastus.azurecontainerapps.io
```

---

## Step 5 — Create Service Principal for GitHub Actions

```bash
az ad sp create-for-rbac \
  --name savehydroo-github-actions \
  --role contributor \
  --scopes /subscriptions/<your-sub-id>/resourceGroups/savehydroo-rg \
  --sdk-auth
# Copy the entire JSON output → this is your AZURE_CREDENTIALS secret
```

---

## Step 6 — Add GitHub Secrets

Go to: **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Value |
|---|---|
| `AZURE_CREDENTIALS` | Full JSON from Step 5 |
| `REGISTRY_LOGIN_SERVER` | `savehydrooregistry.azurecr.io` |
| `REGISTRY_USERNAME` | `savehydrooregistry` |
| `REGISTRY_PASSWORD` | Password from Step 2 |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service role key |

---

## Step 7 — Update Wokwi URL

After getting your Azure app URL from Step 4, update `simulation/main.ino` line 10:

```cpp
const char *FUNCTION_URL = "https://savehydroo-app.<your-id>.eastus.azurecontainerapps.io/api/sensor-data";
```

---

## Step 8 — Deploy!

```bash
git add .
git commit -m "feat: migrate to Azure Container Apps"
git push origin main
# → GitHub Actions will build, push, and deploy automatically
```

Watch progress at: **GitHub repo → Actions tab**
