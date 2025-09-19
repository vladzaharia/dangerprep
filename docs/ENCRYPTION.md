# DangerPrep Hardware Encryption System

The DangerPrep Hardware Encryption System provides secure, hardware-backed file and directory encryption using YubiKey PIV keys. This system ensures that your sensitive data is protected with modern encryption standards and can only be decrypted with physical access to your YubiKey hardware.

## Features

- **Hardware-backed encryption** using YubiKey 5 PIV keys
- **Modern encryption** with age encryption tool and X25519 keys
- **Chunked storage** for performance and reliability
- **Metadata protection** with randomized filenames
- **Idempotent operations** with integrity verification
- **Multiple YubiKey support** for redundancy
- **Compression** support for efficient storage
- **Backup creation** before encryption

## Security Properties

- **No metadata leakage**: Encrypted files use randomized names
- **Hardware key storage**: Private keys never leave the YubiKey
- **Touch/PIN policies**: Configurable user presence requirements
- **Strong encryption**: AES-256 equivalent with X25519 keys
- **Secure deletion**: Temporary files are securely wiped
- **Integrity verification**: Hash checking for data consistency

## Installation

The encryption system is automatically installed during DangerPrep setup. To install manually:

```bash
sudo /opt/dangerprep/scripts/setup/setup-encryption.sh
```

## Quick Start

1. **Initialize YubiKey PIV keys**:
   ```bash
   sudo dp-encrypt init
   ```

2. **Configure targets** in `/etc/dangerprep/encryption.yaml`

3. **Encrypt configured files**:
   ```bash
   sudo dp-encrypt
   ```

4. **Decrypt files** (requires YubiKey):
   ```bash
   sudo dp-decrypt
   ```

## Configuration

The main configuration file is located at `/etc/dangerprep/encryption.yaml`. Key sections:

### YubiKey Configuration

```yaml
yubikeys:
  primary:
    slot: "9a"              # PIV slot (9a, 9c, 9d, 9e, 82-95)
    touch_policy: "always"  # never, always, cached
    pin_policy: "once"      # never, once, always
    algorithm: "ECCP256"    # ECCP256, ECCP384, RSA1024, RSA2048
```

### Encryption Settings

```yaml
encryption:
  chunk_size: 100           # MB per chunk
  compression:
    enabled: true
    algorithm: "zstd"       # gzip, bzip2, xz, lz4, zstd
    level: 3
  storage:
    base_path: "/data/encrypted"
    randomize_filenames: true
```

### Target Configuration

```yaml
targets:
  documents:
    source: "/home/user/Documents"
    type: "directory"
    include:
      - "*.pdf"
      - "*.doc*"
    exclude:
      - "*.tmp"
    recursive: true
    enabled: true
```

## Commands

### dp-encrypt

Encrypts all configured targets:

```bash
# Encrypt all enabled targets
sudo dp-encrypt

# Show what would be encrypted (dry run)
sudo dp-encrypt --dry-run

# Use alternative configuration
sudo dp-encrypt --config /path/to/config.yaml

# Enable verbose output
sudo dp-encrypt --verbose
```

### dp-decrypt

Decrypts all encrypted bundles:

```bash
# Decrypt all bundles
sudo dp-decrypt

# Dry run mode
sudo dp-decrypt --dry-run

# Force decryption without confirmation
sudo dp-decrypt --force
```

### System Management

```bash
# Show system status
sudo dp-encrypt status

# List encrypted bundles
sudo dp-encrypt list

# Initialize YubiKey PIV keys
sudo dp-encrypt init

# Show help
sudo dp-encrypt help
```

## YubiKey PIV Slots

The system uses YubiKey PIV (Personal Identity Verification) slots for key storage:

- **Slot 9a**: Authentication key (default primary)
- **Slot 9c**: Digital signature key
- **Slot 9d**: Key management key
- **Slot 9e**: Card authentication key
- **Slots 82-95**: Additional key slots (24 total)

## Security Best Practices

1. **Use touch policy "always"** to require physical presence
2. **Set PIN policy appropriately** for your security needs
3. **Configure multiple YubiKeys** for redundancy
4. **Regularly backup** your configuration
5. **Test decryption** periodically to ensure keys work
6. **Store YubiKeys securely** when not in use

## Architecture

The system consists of several components:

1. **Configuration Management**: YAML-based configuration with validation
2. **YubiKey Integration**: PIV key generation and management
3. **Encryption Engine**: age encryption with hardware keys
4. **Chunking System**: File splitting for performance
5. **Storage Management**: Secure storage with metadata protection
6. **CLI Interface**: User-friendly command-line tools

## File Format

Encrypted data is stored as:

```
/data/encrypted/
├── bundle1.manifest.age    # Encrypted manifest
├── a1b2c3d4.age           # Encrypted chunk 1
├── e5f6g7h8.age           # Encrypted chunk 2
└── ...
```

Each bundle consists of:
- **Manifest file**: Contains chunk mapping and metadata
- **Chunk files**: Encrypted data chunks with randomized names

## Troubleshooting

### YubiKey Not Detected

```bash
# Check YubiKey presence
ykman list

# Check PIV applet
ykman piv info

# Reset PIV applet (WARNING: destroys keys)
ykman piv reset
```

### Encryption Fails

```bash
# Check system status
sudo dp-encrypt status

# Verify configuration
sudo yq eval . /etc/dangerprep/encryption.yaml

# Check logs
sudo tail -f /var/log/dangerprep-encryption.log
```

### Decryption Fails

1. Ensure YubiKey is inserted
2. Check PIN/touch policies
3. Verify encrypted files exist
4. Check YubiKey PIV keys match configuration

## Performance Considerations

- **Chunk size**: Larger chunks = fewer files, but less parallelism
- **Compression**: Reduces storage but increases CPU usage
- **Parallel jobs**: More jobs = faster processing, but higher memory usage
- **Buffer size**: Larger buffers = better I/O performance

## Backup and Recovery

The system automatically creates backups before encryption if enabled:

```yaml
backup:
  create_backup: true
  backup_path: "/data/backup/pre-encryption"
  retention_days: 30
```

For disaster recovery:
1. Keep YubiKey backups in secure locations
2. Store configuration backups separately
3. Test recovery procedures regularly
4. Document your key management process

## Integration with DangerPrep

The encryption system integrates seamlessly with DangerPrep:

- Installed automatically during setup
- Uses DangerPrep logging and configuration patterns
- Follows DangerPrep security standards
- Compatible with DangerPrep backup systems
