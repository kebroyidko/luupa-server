# The default bun image is Debian-based and includes standard C++ libraries
FROM oven/bun:1
WORKDIR /app

# Copy dependency definitions (supports both bun.lockb and bun.lock)
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install

# Copy the rest of the project
COPY . .

# Default command (Coolify will still override this with the Start Command from your UI)
CMD ["bun", "run", "src/index.ts"]
