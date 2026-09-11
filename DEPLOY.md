# Deploy Z Social publicly

## 1. Create a cloud database

1. Create a free MongoDB Atlas project and M0 cluster.
2. Create a database user and copy its `mongodb+srv://...` connection string.
3. In Network Access, allow the Render service to connect (for initial setup, `0.0.0.0/0` is the simple option; restrict this later).

## 2. Upload this folder to GitHub

Create a new empty GitHub repository, then upload every file in this `outputs` folder. Do not upload `.env` or `uploads`.

## 3. Deploy from Render

1. Sign in to Render with GitHub.
2. Select **New → Blueprint** and choose the repository.
3. Render reads `render.yaml` and creates both services.
4. For **z-social-api**, set `MONGODB_URI` to your Atlas connection string.
5. Deploy the API once and copy its `https://...onrender.com` URL.
6. For **z-social-web**, set `VITE_API_URL` to that API URL, then redeploy the static site.

The static site's URL is the public Z Social link to share. It may take a minute to wake up on free plans.

## Production checklist

- Use the generated `JWT_SECRET` instead of the local development secret.
- Add the published web URL to the backend CORS allowlist before a production launch.
- Replace disk-based uploads with cloud object storage (Cloudinary, S3, or similar) for persistent photos and videos.
