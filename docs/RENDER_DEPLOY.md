# SpeakingFlow API on Render

The repository root contains `render.yaml`, which creates a Frankfurt web
service named `speakingflow-api`.

## First deployment

1. Connect the GitHub repository to Render and create a Blueprint from
   `render.yaml`.
2. Enter `OPENAI_API_KEY` when Render prompts for the secret. Never commit the
   key to the repository.
3. Wait for the deployment to become healthy and verify:
   `https://<service-name>.onrender.com/health`.
4. Set the mobile production environment variable to the public HTTPS URL:
   `EXPO_PUBLIC_API_BASE_URL=https://<service-name>.onrender.com`.
5. Create a new EAS iOS build. The backend URL is embedded at build time, so an
   existing build will not pick up the new URL automatically.

The Blueprint intentionally starts on Render's free instance for deployment
testing. Upgrade before a public App Store release to avoid cold starts.
