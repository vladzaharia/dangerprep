#!/bin/bash
# =============================================================================
# DANGERPREP ENVIRONMENT VARIABLE PARSING TEST
# =============================================================================
# Test and display environment variable directive parsing using the actual
# functions from docker-env-config.sh and gum-utils.sh
# Usage:
#   ./test-env-parsing-simple.sh [service-name]  # Test specific service
#   ./test-env-parsing-simple.sh                 # Test all services
#   ./test-env-parsing-simple.sh --summary       # Show summary only

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Source required utilities
# shellcheck source=../shared/gum-utils.sh
source "${SCRIPT_DIR}/../shared/gum-utils.sh"

# Source the actual docker environment configuration functions
# shellcheck source=../setup/helpers/docker-env-config.sh
source "${SCRIPT_DIR}/../setup/helpers/docker-env-config.sh"

# Parse arguments
SERVICE_NAME=""
SHOW_SUMMARY=false
SHOW_DETAILED=true

case "${1:-}" in
    "--summary"|"-s")
        SHOW_SUMMARY=true
        SHOW_DETAILED=false
        ;;
    "--help"|"-h")
        echo "Usage: $0 [service-name|--summary|--help]"
        echo ""
        echo "Options:"
        echo "  service-name    Test specific service (e.g., step-ca, jellyfin)"
        echo "  --summary, -s   Show summary of all directives only"
        echo "  --help, -h      Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0              # Test all services with detailed output"
        echo "  $0 step-ca      # Test step-ca service only"
        echo "  $0 --summary    # Show summary of all directives"
        exit 0
        ;;
    "")
        # Default: show all services
        SERVICE_NAME=""
        ;;
    *)
        SERVICE_NAME="$1"
        ;;
esac

DOCKER_DIR="${PROJECT_ROOT}/docker"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

# Test configuration
TEST_OUTPUT_DIR="${PROJECT_ROOT}/test-output"
TEST_MODE=true

# Override gum functions for testing (non-interactive mode)
setup_test_mode() {
    # Create test output directory
    mkdir -p "${TEST_OUTPUT_DIR}"

    # Set environment variables for testing
    export INSTALL_ROOT="${PROJECT_ROOT}"
    export TZ="America/Los_Angeles"

    # Override enhanced functions to be non-interactive for testing
    enhanced_input() {
        local prompt="$1"
        local default="${2:-}"
        local placeholder="${3:-}"

        echo -e "${BLUE}[PROMPT]${NC} ${prompt}"
        [[ -n "${default}" ]] && echo -e "  Default: ${default}"
        [[ -n "${placeholder}" ]] && echo -e "  Placeholder: ${placeholder}"

        # Use default if available, otherwise use a test value
        local test_value="${default:-test_value_for_${prompt// /_}}"
        echo -e "  → Test value: ${test_value}"
        echo "${test_value}"
    }

    enhanced_password() {
        local prompt="$1"
        local placeholder="${2:-}"

        echo -e "${RED}[PASSWORD]${NC} ${prompt}"
        [[ -n "${placeholder}" ]] && echo -e "  Placeholder: ${placeholder}"
        echo -e "  → Test value: [hidden test password]"
        echo "test_password_123"
    }

    enhanced_confirm() {
        local question="$1"
        local default="${2:-false}"

        echo -e "${CYAN}[CONFIRM]${NC} ${question}"
        echo -e "  Default: ${default}"
        echo -e "  → Test value: ${default}"
        [[ "${default}" == "true" ]]
    }

    # Override log functions to be more visible in test mode
    log_info() {
        echo -e "${GREEN}[INFO]${NC} $*"
    }

    log_warn() {
        echo -e "${YELLOW}[WARN]${NC} $*"
    }

    log_error() {
        echo -e "${RED}[ERROR]${NC} $*"
    }

    log_debug() {
        echo -e "${BLUE}[DEBUG]${NC} $*"
    }

    log_success() {
        echo -e "${GREEN}[SUCCESS]${NC} $*"
    }
}

# Test parsing using the real functions
test_service_parsing() {
    local service_name="$1"
    local service_dir="$2"

    echo -e "\n${GREEN}=== Testing ${service_name} ===${NC}"
    echo "Service directory: ${service_dir}"
    echo ""

    # Create a temporary environment file for testing
    local temp_env_file="${TEST_OUTPUT_DIR}/${service_name}.env"
    local env_example="${service_dir}/compose.env.example"

    if [[ ! -f "${env_example}" ]]; then
        echo -e "${YELLOW}No compose.env.example found for ${service_name}${NC}"
        return 0
    fi

    echo "Using example file: ${env_example}"
    echo ""

    # Copy the example file to our test location
    cp "${env_example}" "${temp_env_file}"
    chmod 600 "${temp_env_file}"

    # Use the real parsing function
    echo -e "${BLUE}Running actual parsing logic...${NC}"
    echo ""

    # Call the real function from docker-env-config.sh
    parse_and_process_env_directives "${env_example}" "${temp_env_file}" "${service_name}"

    echo ""
    echo -e "${GREEN}✓ Parsing completed for ${service_name}${NC}"

    # Show what was written to the env file
    if [[ -f "${temp_env_file}" ]]; then
        echo ""
        echo -e "${CYAN}Environment file changes:${NC}"
        echo "----------------------------------------"
        # Show lines that were modified (different from example)
        if ! diff -q "${env_example}" "${temp_env_file}" >/dev/null 2>&1; then
            echo "Variables that were processed:"
            diff "${env_example}" "${temp_env_file}" | grep "^>" | head -10 || true
        else
            echo "No changes made to environment file"
        fi
    fi
}

# Show summary of all directives
show_summary() {
    echo -e "${BLUE}DangerPrep Environment Variable Directives Summary${NC}"
    echo "=================================================="
    echo ""

    local total_prompt=0
    local total_generate=0
    local total_password=0
    local total_email=0
    local total_other=0

    # Process each service
    find "${DOCKER_DIR}" -name "compose.env.example" -type f | sort | while read -r file; do
        local service_path
        service_path=$(dirname "$file")
        local service_name
        service_name=$(basename "$service_path")
        local category
        category=$(basename "$(dirname "$service_path")")

        # Count directives in this file
        local prompt_count
        prompt_count=$(grep -c "^# PROMPT:" "$file" || true)
        local generate_count
        generate_count=$(grep -c "^# GENERATE:" "$file" || true)
        local password_count
        password_count=$(grep -c "^# PASSWORD:" "$file" || true)
        local email_count
        email_count=$(grep -c "^# EMAIL:" "$file" || true)
        local other_count
        other_count=$(grep -c "^# \(REQUIRED\|OPTIONAL\):" "$file" || true)

        local total_count=$((prompt_count + generate_count + password_count + email_count + other_count))

        if [[ $total_count -gt 0 ]]; then
            echo -e "${CYAN}${category}/${service_name}${NC} (${total_count} variables)"
            [[ $prompt_count -gt 0 ]] && echo -e "  ${GREEN}PROMPT:${NC} $prompt_count"
            [[ $generate_count -gt 0 ]] && echo -e "  ${YELLOW}GENERATE:${NC} $generate_count"
            [[ $password_count -gt 0 ]] && echo -e "  ${RED}PASSWORD:${NC} $password_count"
            [[ $email_count -gt 0 ]] && echo -e "  ${BLUE}EMAIL:${NC} $email_count"
            [[ $other_count -gt 0 ]] && echo -e "  ${CYAN}OTHER:${NC} $other_count"
        fi
    done

    echo ""
    echo -e "${BLUE}Totals Across All Services${NC}"
    echo "=========================="

    # Count totals across all files
    total_prompt=$(find "${DOCKER_DIR}" -name "compose.env.example" -exec grep -c "^# PROMPT:" {} \; 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
    total_generate=$(find "${DOCKER_DIR}" -name "compose.env.example" -exec grep -c "^# GENERATE:" {} \; 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
    total_password=$(find "${DOCKER_DIR}" -name "compose.env.example" -exec grep -c "^# PASSWORD:" {} \; 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
    total_email=$(find "${DOCKER_DIR}" -name "compose.env.example" -exec grep -c "^# EMAIL:" {} \; 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
    total_other=$(find "${DOCKER_DIR}" -name "compose.env.example" -exec grep -c "^# \(REQUIRED\|OPTIONAL\):" {} \; 2>/dev/null | awk '{sum+=$1} END {print sum+0}')

    local grand_total=$((total_prompt + total_generate + total_password + total_email + total_other))

    echo -e "${GREEN}PROMPT variables:${NC}   $total_prompt"
    echo -e "${YELLOW}GENERATE variables:${NC} $total_generate"
    echo -e "${RED}PASSWORD variables:${NC} $total_password"
    echo -e "${BLUE}EMAIL variables:${NC}    $total_email"
    echo -e "${CYAN}OTHER variables:${NC}    $total_other"
    echo "------------------------"
    echo -e "${BLUE}TOTAL:${NC}              $grand_total"
}

# List available services
list_services() {
    echo "Available services:"
    find "${DOCKER_DIR}" -name "compose.env.example" -type f | while read -r file; do
        local service_path
        service_path=$(dirname "$file")
        local service_name
        service_name=$(basename "$service_path")
        local category
        category=$(basename "$(dirname "$service_path")")
        echo "  ${category}/${service_name}"
    done
}

# Cleanup function
cleanup_test() {
    if [[ -d "${TEST_OUTPUT_DIR}" ]]; then
        rm -rf "${TEST_OUTPUT_DIR}"
    fi
}

# Main function
main() {
    echo -e "${BLUE}DangerPrep Environment Variable Parsing Test${NC}"
    echo "============================================="
    echo "Using REAL parsing functions from docker-env-config.sh"
    echo "Testing gum-utils integration in non-interactive mode"
    echo ""

    # Setup test mode
    setup_test_mode

    # Trap cleanup on exit
    trap cleanup_test EXIT

    # Handle summary mode
    if [[ "${SHOW_SUMMARY}" == "true" ]]; then
        show_summary
        echo ""
        echo -e "${GREEN}✓ Summary completed${NC}"
        return 0
    fi

    # Handle specific service or all services
    if [[ -n "${SERVICE_NAME}" ]]; then
        # Test specific service
        local service_dir
        service_dir=$(find "${DOCKER_DIR}" -type d -name "${SERVICE_NAME}" | head -1)

        if [[ -z "${service_dir}" ]]; then
            echo -e "${RED}Error: Service '${SERVICE_NAME}' not found${NC}"
            echo ""
            list_services
            exit 1
        fi

        test_service_parsing "${SERVICE_NAME}" "${service_dir}"
    else
        # Test all services
        echo ""
        find "${DOCKER_DIR}" -name "compose.env.example" -type f | sort | while read -r file; do
            local service_path
            service_path=$(dirname "${file}")
            local service_name
            service_name=$(basename "${service_path}")

            test_service_parsing "${service_name}" "${service_path}"
        done

        echo ""
        echo -e "${BLUE}=== SUMMARY ===${NC}"
        show_summary
    fi

    echo ""
    echo -e "${GREEN}✓ Parsing test completed${NC}"
    echo -e "${CYAN}Test output directory: ${TEST_OUTPUT_DIR}${NC}"
}

main "$@"
