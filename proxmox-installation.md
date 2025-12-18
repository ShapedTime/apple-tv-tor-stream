# Proxmox Deployment Plan: AppleTV Torrent Streaming Stack

## Overview

Deploy a single Ubuntu VM running Docker Compose with all 3 services:
- **PrettyTVCatalog** (port 3000) - Web UI for browsing media
- **distribyted** (ports 4444, 36911) - Torrent client + WebDAV for AppleTV
- **Jackett** (port 9117) - Torrent indexer aggregator

**Why VM over LXC?** distribyted requires FUSE + SYS_ADMIN capability. VMs provide native support without workarounds.

---

# PART 1: Proxmox Host Setup

Everything in this section is done in the Proxmox web UI or Proxmox host shell.

## 1.1 Download Ubuntu ISO

1. Go to **Datacenter → Storage → local → ISO Images**
2. Click **Download from URL**
3. Enter: `https://releases.ubuntu.com/24.04/ubuntu-24.04.1-live-server-amd64.iso`
4. Click **Download**

## 1.2 Create the VM

**Option A: Via Web UI**

1. Click **Create VM** (top right)
2. **General**:
   - VM ID: `200` (or any available)
   - Name: `appletv-streaming`
3. **OS**:
   - ISO image: Select the Ubuntu 24.04 ISO
   - Type: Linux, Version: 6.x - 2.6 Kernel
4. **System**:
   - Machine: q35
   - BIOS: OVMF (UEFI) - optional but recommended
   - Add EFI Disk if using UEFI
5. **Disks**:
   - Bus: SCSI, Size: **32 GB** (system disk)
   - Click **Add** → another SCSI disk, Size: **200 GB** (data disk)
6. **CPU**:
   - Cores: **4**
   - Type: **host** (best performance)
7. **Memory**:
   - Memory: **8192 MB** (8 GB)
8. **Network**:
   - Bridge: **vmbr0**
   - Model: VirtIO

**Option B: Via Shell (SSH to Proxmox host)**

```bash
qm create 200 \
  --name appletv-streaming \
  --memory 8192 \
  --cores 4 \
  --cpu host \
  --ostype l26 \
  --scsi0 local-lvm:32 \
  --scsi1 local-lvm:200 \
  --net0 virtio,bridge=vmbr0 \
  --boot order=scsi0
```

## 1.3 Install Ubuntu

1. Start the VM and open the Console
2. Install Ubuntu Server (minimal installation)
3. During install:
   - Set hostname: `streaming`
   - Create user (e.g., `admin`)
   - Enable OpenSSH server
   - Use the 32GB disk for installation (the 200GB disk will be mounted later)

## 1.4 Configure Static IP

After Ubuntu is installed, note the VM's MAC address:
1. Select VM → **Hardware** → **Network Device**
2. Copy the MAC address (e.g., `BC:24:11:XX:XX:XX`)

**On your TP-Link AX3000 router:**
1. Login to router admin (usually 192.168.0.1 or tplinkwifi.net)
2. Go to **Advanced → Network → DHCP Server**
3. Find **Address Reservation** section
4. Click **Add** and enter:
   - MAC Address: (paste from Proxmox)
   - Reserved IP: `192.168.0.150` (or your preferred IP)
5. Save and reboot the VM to get the new IP

---

# PART 2: VM Setup (via SSH)

Everything below is done after SSH-ing into the VM:
```bash
ssh admin@192.168.0.150
```

## 2.1 Update System & Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y \
    ca-certificates \
    curl \
    gnupg \
    git \
    fuse \
    ufw
```

## 2.2 Install Docker

```bash
# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add your user to docker group (avoids needing sudo)
sudo usermod -aG docker $USER

# Apply group change (or logout/login)
newgrp docker
```

## 2.3 Mount Data Disk (200GB)

```bash
# Find the data disk (should be /dev/sdb)
lsblk

# Format it with ext4
sudo mkfs.ext4 /dev/sdb

# Create mount point
sudo mkdir -p /mnt/data

# Add to fstab for automatic mount on boot
echo '/dev/sdb /mnt/data ext4 defaults 0 2' | sudo tee -a /etc/fstab

# Mount now
sudo mount -a

# Create directory structure
sudo mkdir -p /mnt/data/{distribyted/{cache,metadata,config,logs},prettytv,jackett}
sudo chown -R $USER:$USER /mnt/data
```

**Verify:**
```bash
df -h /mnt/data
# Should show ~200GB available
```

## 2.4 Enable FUSE for Docker

```bash
echo 'user_allow_other' | sudo tee /etc/fuse.conf
```

## 2.5 Clone the Repository

```bash
# Create app directory
sudo mkdir -p /opt/streaming-stack
sudo chown $USER:$USER /opt/streaming-stack

# Clone your repo (replace with your actual repo URL)
cd /opt/streaming-stack
git clone https://github.com/YOUR_USERNAME/apple-tv-tor-stream.git .

# Or if copying from local machine:
# scp -r /path/to/apple-tv-tor-stream/* admin@192.168.0.150:/opt/streaming-stack/
```

## 2.6 Create Environment File

```bash
cat > /opt/streaming-stack/.env << 'EOF'
# ===================
# REQUIRED VARIABLES
# ===================

# Authentication password for the web UI
APP_PASSWORD=CHANGE_THIS_TO_STRONG_PASSWORD

# TMDB API Key - get from https://www.themoviedb.org/settings/api
TMDB_API_KEY=your_tmdb_api_key_here

# Session secret for JWT tokens (generate with: openssl rand -base64 32)
SESSION_SECRET=GENERATE_A_32_CHAR_SECRET_HERE

# ===================
# OPTIONAL VARIABLES
# ===================

# Jackett API key - get from Jackett web UI after first run (http://IP:9117)
JACKETT_API_KEY=will_fill_after_first_run
EOF

# Secure the file
chmod 600 /opt/streaming-stack/.env
```

## 2.7 Create Docker Compose Override

This file adds production volume mounts without modifying the original docker-compose.yml:

```bash
cat > /opt/streaming-stack/docker-compose.override.yml << 'EOF'
services:
  distribyted:
    volumes:
      - /mnt/data/distribyted/config:/distribyted-data/config
      - /mnt/data/distribyted/metadata:/distribyted-data/metadata
      - /mnt/data/distribyted/cache:/distribyted-data/cache
      - /mnt/data/distribyted/logs:/distribyted-data/logs
    devices:
      - /dev/fuse

  prettytvcatalog:
    volumes:
      - /mnt/data/prettytv:/app/data

  jackett:
    volumes:
      - /mnt/data/jackett:/config
EOF
```

## 2.8 Create distribyted Config

```bash
cat > /mnt/data/distribyted/config/config.yaml << 'EOF'
http:
  port: 4444
  ip: "0.0.0.0"
  httpfs: true

webdav:
  port: 36911
  user: streaming
  pass: CHANGE_THIS_TO_STRONG_PASSWORD

torrent:
  global_cache_size: 71680  # 70GB cache
  metadata_folder: /distribyted-data/metadata
  add_timeout: 60
  read_timeout: 120

fuse:
  path: /distribyted-data/mount

log:
  path: /distribyted-data/logs
  max_backups: 2
  max_size: 50

routes:
  - name: default
    torrents: []

servers: []
EOF
```

**Important:** Edit this file and change `CHANGE_THIS_TO_STRONG_PASSWORD` to match your `.env` file:
```bash
nano /mnt/data/distribyted/config/config.yaml
```

## 2.9 Configure Firewall

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow PrettyTVCatalog Web UI
sudo ufw allow 3000/tcp

# Allow WebDAV (AppleTV streaming) - CRITICAL
sudo ufw allow 36911/tcp

# Allow distribyted API
sudo ufw allow 4444/tcp

# Allow Jackett (for initial setup)
sudo ufw allow 9117/tcp

# Enable firewall
sudo ufw enable
```

## 2.10 Create Systemd Service (Auto-start on Boot)

```bash
sudo tee /etc/systemd/system/streaming-stack.service << 'EOF'
[Unit]
Description=AppleTV Streaming Stack
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/streaming-stack/apple-tv-tor-stream
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

# Enable service
sudo systemctl daemon-reload
sudo systemctl enable streaming-stack.service
```

## 2.11 Build and Start Services

```bash
cd /opt/streaming-stack

# Build and start all services (first run takes 5-10 minutes)
docker compose up -d --build

# Watch the logs
docker compose logs -f

# Press Ctrl+C to exit logs (services keep running)
```

## 2.12 Verify Services

```bash
# Check all containers are running
docker compose ps

# Test endpoints
curl http://localhost:3000        # PrettyTVCatalog
curl http://localhost:4444/api/status  # distribyted
curl http://localhost:9117        # Jackett
```

## 2.13 Configure Jackett

1. Open browser: `http://192.168.0.150:9117`
2. Copy the **API Key** from the top of the page
3. Update your `.env` file:
   ```bash
   nano /opt/streaming-stack/.env
   # Change: JACKETT_API_KEY=your_actual_api_key
   ```
4. Restart prettytvcatalog:
   ```bash
   docker compose restart prettytvcatalog
   ```

## 2.14 Verify Health Checks

```bash
# Check all services are healthy
docker compose ps

# Test PrettyTVCatalog health endpoint
curl http://localhost:3000/api/health

# Expected response: {"status":"healthy","timestamp":"...","services":{"tmdb":"up"}}
```

---

# PART 3: Remote Access Setup

## Option A: Tailscale (Recommended - Most Secure)

Tailscale creates a private VPN network. No port forwarding needed, works from anywhere.

**On the VM:**
```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Start and authenticate
sudo tailscale up

# Note the Tailscale IP (e.g., 100.x.x.x)
tailscale ip -4
```

**On your phone/laptop:**
1. Install Tailscale app
2. Login with same account
3. Access services via Tailscale IP:
   - Web UI: `http://100.x.x.x:3000`
   - WebDAV: `http://100.x.x.x:36911`

**Pros:** No ports exposed to internet, encrypted, works behind any NAT
**Cons:** Requires Tailscale app on all devices

---

## Option B: TP-Link DDNS + Port Forwarding (Less Secure)

If you must use port forwarding:

**On TP-Link Router:**
1. **Advanced → Network → Dynamic DNS**
2. Enable TP-Link DDNS, note your hostname (e.g., `yourname.tplinkdns.com`)

3. **Advanced → NAT Forwarding → Port Forwarding**
4. Add rules:

| Service | External Port | Internal IP | Internal Port |
|---------|--------------|-------------|---------------|
| Web UI | 3000 | 192.168.0.150 | 3000 |
| WebDAV | 36911 | 192.168.0.150 | 36911 |

**Security Warning:** Exposing WebDAV to the internet is risky. If using this option:
- Use very strong passwords
- Consider adding a reverse proxy with HTTPS (nginx/caddy)
- Don't expose Jackett (9117) - setup only

---

# PART 4: AppleTV Configuration

## In VLC or Infuse on AppleTV:

1. Go to **Network Streams** or **Add Share**
2. Select **WebDAV**
3. Enter:
   - **Server:** `192.168.0.150` (local) or your Tailscale IP
   - **Port:** `36911`
   - **Username:** `streaming`
   - **Password:** (your password from config.yaml)

---

# Maintenance Commands

```bash
# SSH to server
ssh admin@192.168.0.150

# View logs
cd /opt/streaming-stack
docker compose logs -f              # All services
docker compose logs -f distribyted  # Specific service

# Restart a service
docker compose restart prettytvcatalog

# Update the stack
git pull
docker compose build --pull
docker compose down && docker compose up -d

# Check disk usage
df -h /mnt/data
du -sh /mnt/data/*

# Backup library database
cp /mnt/data/prettytv/library.db ~/library-backup-$(date +%Y%m%d).db
```

---

# Quick Reference

| Service | Local URL | Port |
|---------|-----------|------|
| PrettyTVCatalog | http://192.168.0.150:3000 | 3000 |
| WebDAV (AppleTV) | http://192.168.0.150:36911 | 36911 |
| distribyted API | http://192.168.0.150:4444 | 4444 |
| Jackett | http://192.168.0.150:9117 | 9117 |

---

# Files Created/Modified Summary

| Location | File | Purpose |
|----------|------|---------|
| VM | `/opt/streaming-stack/.env` | Secrets (API keys, passwords) |
| VM | `/opt/streaming-stack/docker-compose.override.yml` | Production volume mounts |
| VM | `/mnt/data/distribyted/config/config.yaml` | distribyted settings |
| VM | `/etc/systemd/system/streaming-stack.service` | Auto-start service |
| VM | `/etc/fuse.conf` | FUSE permissions |
| Router | DHCP Reservation | Static IP for VM |
