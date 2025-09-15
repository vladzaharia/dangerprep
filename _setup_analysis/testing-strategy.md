# Testing Strategy

## Overview

This document outlines a comprehensive testing strategy for the DangerPrep setup system, covering both the current monolithic architecture and the proposed modular architecture. The strategy ensures reliability, maintainability, and regression prevention across all supported platforms and configurations.

## Current Testing Challenges

### Monolithic Architecture Issues
- **Integration Testing Only**: Difficult to test individual components
- **Long Feedback Cycles**: Full system installation required for testing
- **State Dependencies**: Tests require clean system state
- **Hardware Dependencies**: Platform-specific testing challenges
- **Network Dependencies**: External service dependencies
- **Destructive Operations**: System modifications make testing risky

### Existing Testing Elements
- **Dry Run Mode**: `DRY_RUN=true` for non-destructive testing
- **System Requirements Check** : Pre-flight validation
- **Function Existence Validation**: Runtime function checking
- **Configuration Validation**: Input validation throughout
- **Resume Capability**: Built-in recovery testing

## Comprehensive Testing Framework

### 1. Unit Testing Framework

#### Test Framework Structure
```bash
# test_runner
#!/bin/bash

# Test framework globals
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TEST_OUTPUT=""

# Assertion functions
assert_equals() {
  local expected="$1"
  local actual="$2"
  local message="${3:-Assertion failed}"
  
  ((TESTS_RUN++))
  if [[ "$expected" == "$actual" ]]; then
    ((TESTS_PASSED++))
    echo "✓ $message"
  else
    ((TESTS_FAILED++))
    echo "✗ $message: expected '$expected', got '$actual'"
  fi
}

assert_true() {
  local condition="$1"
  local message="${2:-Condition should be true}"
  
  if [[ $condition -eq 0 ]]; then
    assert_equals "true" "true" "$message"
  else
    assert_equals "true" "false" "$message"
  fi
}

assert_file_exists() {
  local file="$1"
  local message="${2:-File should exist: $file}"
  
  if [[ -f "$file" ]]; then
    assert_equals "exists" "exists" "$message"
  else
    assert_equals "exists" "missing" "$message"
  fi
}

# Test runner
run_test_suite() {
  local test_file="$1"
  echo "Running test suite: $(basename "$test_file")"
  source "$test_file"
  
  if declare -f "run_tests" >/dev/null; then
    run_tests
  fi
  
  echo "Tests: $TESTS_RUN, Passed: $TESTS_PASSED, Failed: $TESTS_FAILED"
  return $TESTS_FAILED
}
```

#### Unit Test Examples
```bash
# test_runner
#!/bin/bash
source "$(dirname "$0")/../framework/test_framework"
source "$(dirname "$0")/../../lib/dangerprep/utils/validation"

test_validate_ip_address() {
  assert_true "$(validate_ip_address "192.168.1.1"; echo $?)" "Valid IP should pass"
  assert_true "$(validate_ip_address "256.1.1.1"; echo $?)" "Invalid IP should fail"
  assert_true "$(validate_ip_address "not.an.ip"; echo $?)" "Non-IP should fail"
}

test_validate_port_number() {
  assert_true "$(validate_port_number "80"; echo $?)" "Valid port should pass"
  assert_true "$(validate_port_number "65536"; echo $?)" "Invalid port should fail"
  assert_true "$(validate_port_number "abc"; echo $?)" "Non-numeric should fail"
}

run_tests() {
  test_validate_ip_address
  test_validate_port_number
}
```

### 2. Integration Testing

#### Docker Container Testing Environment
```bash
# test_runner
FROM ubuntu:24.04

# Install test dependencies
RUN apt-get update && apt-get install -y \
  sudo curl wget git systemd \
  && rm -rf /var/lib/apt/lists/*

# Create test user with sudo privileges
RUN useradd -m -s /bin/run_setup_system && \
  echo "testuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Copy test modules
COPY test_runner /test_runner
COPY setup-system/ /dangerprep/setup-system/
COPY lib/ /dangerprep/lib/

WORKDIR /dangerprep
USER testuser

CMD ["/test_runner
```

#### Integration Test Suite
```bash
# test_runner
#!/bin/bash

set -euo pipefail

# Test configuration
export DRY_RUN=true
export NON_INTERACTIVE=true
export SKIP_NETWORK_TESTS=false

# Test phases
test_system_requirements() {
  echo "Testing system requirements check..."
  if ! run_system_requirements_check; then
    echo "✗ System requirements check failed"
    return 1
  fi
  echo "✓ System requirements check passed"
}

test_configuration_collection() {
  echo "Testing configuration collection..."
  # Test with default configuration
  if ! run_setup_system --dry-run --non-interactive; then
    echo "✗ Configuration collection failed"
    return 1
  fi
  echo "✓ Configuration collection passed"
}

test_package_installation() {
  echo "Testing package installation (dry run)..."
  # Test package selection and installation logic
  export SELECTED_PACKAGE_CATEGORIES="Convenience packages"
  if ! run_setup_system --dry-run --phase install_essential_packages; then
    echo "✗ Package installation test failed"
    return 1
  fi
  echo "✓ Package installation test passed"
}

# Run all integration tests
main() {
  echo "Starting integration tests..."
  
  test_system_requirements
  test_configuration_collection
  test_package_installation
  
  echo "All integration tests passed!"
}

main "$@"
```

### 3. Platform Testing

#### Multi-Platform Test Matrix
```bash
# test_runner
#!/bin/bash

# Platform test configurations
declare -A PLATFORM_CONFIGS=(
  ["ubuntu24-amd64"]="ubuntu:24.04"
  ["ubuntu24-arm64"]="ubuntu:24.04"
  ["friendlyelec-r6c"]="custom/friendlyelec-r6c"
  ["friendlyelec-m6"]="custom/friendlyelec-m6"
)

# Hardware simulation
simulate_friendlyelec_hardware() {
  local platform="$1"
  
  # Create mock device tree
  mkdir -p /proc/device-tree
  case "$platform" in
    "r6c")
      echo "FriendlyElec NanoPi R6C" > /proc/device-tree/model
      ;;
    "m6")
      echo "FriendlyElec NanoPi M6" > /proc/device-tree/model
      ;;
  esac
}

# Network interface simulation
simulate_network_interfaces() {
  local interface_count="$1"
  
  # Create mock network interfaces
  for i in $(seq 1 "$interface_count"); do
    ip link add "eth$((i-1))" type dummy
  done
}

# Storage simulation
simulate_nvme_storage() {
  local size_gb="$1"
  
  # Create mock NVMe device
  mkdir -p /sys/block/nvme0n1
  echo "$((size_gb * 1024 * 1024 * 1024))" > /sys/block/nvme0n1/size
}
```

### 4. Performance Testing

#### Performance Benchmarking
```bash
# test_runner
#!/bin/bash

# Performance metrics collection
collect_performance_metrics() {
  local test_name="$1"
  local start_time="$2"
  local end_time="$3"
  
  local duration=$((end_time - start_time))
  local memory_usage=$(free -m | awk 'NR==2{printf "%.2f%%", $3*100/$2}')
  local disk_usage=$(df / | awk 'NR==2{printf "%.2f%%", $5}')
  
  echo "$test_name,$duration,$memory_usage,$disk_usage" >> performance_results.csv
}

# Installation phase benchmarking
benchmark_installation_phases() {
  local phases=(
    "backup_original_configs"
    "update_system_packages"
    "install_essential_packages"
    "configure_rootless_docker"
    "setup_docker_services"
  )
  
  echo "Phase,Duration(s),Memory Usage,Disk Usage" > performance_results.csv
  
  for phase in "${phases[@]}"; do
    echo "Benchmarking phase: $phase"
    local start_time=$SECONDS
    
    # Run phase in dry-run mode
    run_setup_system --dry-run --phase "$phase"
    
    local end_time=$SECONDS
    collect_performance_metrics "$phase" "$start_time" "$end_time"
  done
}
```

### 5. Security Testing

#### Security Validation Tests
```bash
# test_runner
#!/bin/bash

# Test SSH hardening
test_ssh_hardening() {
  echo "Testing SSH hardening configuration..."
  
  # Check SSH configuration
  local ssh_config="/etc/ssh/sshd_config"
  
  # Test port change
  if ! grep -q "Port 2222" "$ssh_config"; then
    echo "✗ SSH port not changed"
    return 1
  fi
  
  # Test root login disabled
  if ! grep -q "PermitRootLogin no" "$ssh_config"; then
    echo "✗ Root login not disabled"
    return 1
  fi
  
  # Test password authentication disabled
  if ! grep -q "PasswordAuthentication no" "$ssh_config"; then
    echo "✗ Password authentication not disabled"
    return 1
  fi
  
  echo "✓ SSH hardening tests passed"
}

# Test firewall configuration
test_firewall_configuration() {
  echo "Testing firewall configuration..."
  
  # Check iptables rules
  if ! iptables -L | grep -q "DROP"; then
    echo "✗ Default DROP policy not set"
    return 1
  fi
  
  echo "✓ Firewall configuration tests passed"
}

# Test file permissions
test_file_permissions() {
  echo "Testing file permissions..."
  
  local sensitive_files=(
    "/etc/dangerprep/setup-config.conf:600"
    "/etc/ssh/sshd_config:644"
    "/etc/fail2ban/jail.local:644"
  )
  
  for file_perm in "${sensitive_files[@]}"; do
    IFS=':' read -r file expected_perm <<< "$file_perm"
    
    if [[ -f "$file" ]]; then
      local actual_perm=$(stat -c "%a" "$file")
      if [[ "$actual_perm" != "$expected_perm" ]]; then
        echo "✗ Incorrect permissions on $file: $actual_perm (expected $expected_perm)"
        return 1
      fi
    fi
  done
  
  echo "✓ File permissions tests passed"
}
```

### 6. Regression Testing

#### Automated Regression Suite
```bash
# test_runner
#!/bin/bash

# Regression test configuration
REGRESSION_BASELINE="baseline_results.json"
CURRENT_RESULTS="current_results.json"

# Capture system state
capture_system_state() {
  local output_file="$1"
  
  {
    echo "{"
    echo " \"packages\": ["
    dpkg -l | awk '/^ii/ {print "  \"" $2 ":" $3 "\","}' | sed '$ s/,$//'
    echo " ],"
    echo " \"services\": ["
    systemctl list-units --type=service --state=active --no-pager --no-legend | \
      awk '{print "  \"" $1 "\","}' | sed '$ s/,$//'
    echo " ],"
    echo " \"files\": ["
    find /etc/dangerprep -type f 2>/dev/null | \
      awk '{print "  \"" $0 "\","}' | sed '$ s/,$//'
    echo " ]"
    echo "}"
  } > "$output_file"
}

# Compare system states
compare_system_states() {
  local baseline="$1"
  local current="$2"
  
  if ! command -v jq >/dev/null; then
    echo "jq required for state comparison"
    return 1
  fi
  
  # Compare packages
  local baseline_packages=$(jq -r '.packages[]' "$baseline" | sort)
  local current_packages=$(jq -r '.packages[]' "$current" | sort)
  
  if [[ "$baseline_packages" != "$current_packages" ]]; then
    echo "Package differences detected:"
    diff <(echo "$baseline_packages") <(echo "$current_packages")
    return 1
  fi
  
  echo "✓ No regressions detected"
}
```

### 7. Continuous Integration

#### GitHub Actions Workflow
```yaml
# .github/workflows/test.yml
name: DangerPrep Testing

on:
 push:
  branches: [ main, develop ]
 pull_request:
  branches: [ main ]

jobs:
 unit-tests:
  runs-on: ubuntu-24.04
  steps:
   - uses: actions/checkout@v4
   - name: Run unit tests
    run: |
     chmod +x test_runner
     test_runner

 integration-tests:
  runs-on: ubuntu-24.04
  strategy:
   matrix:
    platform: [ubuntu24-amd64, ubuntu24-arm64]
  steps:
   - uses: actions/checkout@v4
   - name: Set up Docker Buildx
    uses: docker/setup-buildx-action@v3
   - name: Run integration tests
    run: |
     docker build -f test_runner -t dangerprep-test .
     docker run --rm dangerprep-test

 security-tests:
  runs-on: ubuntu-24.04
  steps:
   - uses: actions/checkout@v4
   - name: Run security tests
    run: |
     chmod +x test_runner
     sudo run_security_tests

 performance-tests:
  runs-on: ubuntu-24.04
  steps:
   - uses: actions/checkout@v4
   - name: Run performance benchmarks
    run: |
     chmod +x test_runner
     test_runner
   - name: Upload performance results
    uses: actions/upload-artifact@v4
    with:
     name: performance-results
     path: performance_results.csv
```

### 8. Test Data Management

#### Test Configuration Templates
```bash
# test_runner
# Minimal configuration for testing
NEW_USERNAME="testuser"
WIFI_SSID="TestNetwork"
WIFI_PASSWORD="testpassword"
SELECTED_PACKAGE_CATEGORIES="Convenience packages"
SELECTED_DOCKER_SERVICES=""
```

#### Mock Data Generation
```bash
# test_runner
#!/bin/bash

# Generate mock SSH keys
generate_mock_ssh_keys() {
  local key_dir="$1"
  mkdir -p "$key_dir"
  
  # Generate test SSH key pair
  ssh-keygen -t rsa -b 2048 -f "$key_dir/id_rsa" -N "" -C "test@example.com"
}

# Generate mock configuration files
generate_mock_configs() {
  local config_dir="$1"
  mkdir -p "$config_dir"
  
  # Create mock device tree
  mkdir -p "$config_dir/proc/device-tree"
  echo "FriendlyElec NanoPi R6C" > "$config_dir/proc/device-tree/model"
}
```

## Testing Execution Strategy

### 1. Development Testing
- **Pre-commit Hooks**: Run unit tests before commits
- **Local Testing**: Docker-based integration testing
- **IDE Integration**: Test runner integration

### 2. Continuous Integration
- **Automated Testing**: Run on every push/PR
- **Multi-platform Testing**: Test across supported platforms
- **Performance Monitoring**: Track performance regressions

### 3. Release Testing
- **Full Integration Testing**: Complete installation testing
- **Hardware Testing**: Test on actual hardware platforms
- **Security Validation**: Comprehensive security testing
- **Performance Benchmarking**: Performance regression testing

### 4. Post-deployment Testing
- **Smoke Tests**: Basic functionality verification
- **Monitoring**: Continuous system monitoring
- **User Feedback**: Issue tracking and resolution

## Test Metrics and Reporting

### Coverage Metrics
- **Function Coverage**: Percentage of functions tested
- **Line Coverage**: Percentage of code lines executed
- **Branch Coverage**: Percentage of code branches tested
- **Platform Coverage**: Percentage of platforms tested

### Quality Metrics
- **Test Pass Rate**: Percentage of tests passing
- **Defect Density**: Defects per lines of code
- **Mean Time to Failure**: Average time between failures
- **Mean Time to Recovery**: Average recovery time

### Performance Metrics
- **Installation Time**: Time to complete installation
- **Resource Usage**: CPU, memory, disk usage
- **Network Usage**: Bandwidth consumption
- **Boot Time**: System boot time after installation

---

*This testing strategy provides comprehensive coverage for the DangerPrep setup system, ensuring reliability, security, and performance across all supported platforms and configurations. The strategy supports both current monolithic and future modular architectures.*
