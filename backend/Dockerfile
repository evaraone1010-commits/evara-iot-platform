# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Install necessary packages
RUN apk add --no-cache git

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json ./
COPY package-lock.json ./

# Install app dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 8080

# Define the command to run the application
CMD ["node", "src/server.js"]
