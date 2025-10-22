# Use the correct node version
nvm use v22.17.0 

# Install dependencies
pnpm install

# Copy .env file
cp $CONDUCTOR_ROOT_PATH/.env.local .env.local