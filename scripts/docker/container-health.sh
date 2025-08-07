#!/bin/bash
# DangerPrep Container Health Monitoring

LOG_FILE="/var/log/dangerprep-container-health.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

alert() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ALERT: $1" | tee -a "$LOG_FILE"
    logger -t "CONTAINER-ALERT" -p daemon.warning "$1"
}

check_container_health() {
    local unhealthy_containers=()
    local stopped_containers=()

    # Check for unhealthy containers
    while IFS= read -r container; do
        if [[ -n "$container" ]]; then
            unhealthy_containers+=("$container")
        fi
    done < <(docker ps --filter "health=unhealthy" --format "{{.Names}}" 2>/dev/null)

    # Check for stopped containers that should be running
    while IFS= read -r container; do
        if [[ -n "$container" ]]; then
            stopped_containers+=("$container")
        fi
    done < <(docker ps -a --filter "status=exited" --filter "restart=unless-stopped" --format "{{.Names}}" 2>/dev/null)

    # Report unhealthy containers
    if [[ ${#unhealthy_containers[@]} -gt 0 ]]; then
        alert "Unhealthy containers detected: ${unhealthy_containers[*]}"
    fi

    # Report stopped containers
    if [[ ${#stopped_containers[@]} -gt 0 ]]; then
        alert "Stopped containers detected: ${stopped_containers[*]}"

        # Attempt to restart stopped containers
        for container in "${stopped_containers[@]}"; do
            log "Attempting to restart container: $container"
            if docker start "$container" >/dev/null 2>&1; then
                log "Successfully restarted container: $container"
            else
                alert "Failed to restart container: $container"
            fi
        done
    fi
}

check_container_resources() {
    # Check for containers using excessive resources
    local high_cpu_containers=()
    local high_memory_containers=()

    # Get container stats (CPU and memory usage)
    while IFS=',' read -r name cpu memory; do
        if [[ -n "$name" && "$name" != "NAME" ]]; then
            # Remove % sign and convert to number
            cpu_num=$(echo "$cpu" | sed 's/%//')
            memory_num=$(echo "$memory" | sed 's/%//')

            # Check if CPU usage is above 80%
            if (( $(echo "$cpu_num > 80" | bc -l) )); then
                high_cpu_containers+=("$name ($cpu)")
            fi

            # Check if memory usage is above 90%
            if (( $(echo "$memory_num > 90" | bc -l) )); then
                high_memory_containers+=("$name ($memory)")
            fi
        fi
    done < <(docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemPerc}}" 2>/dev/null)

    # Report high resource usage
    if [[ ${#high_cpu_containers[@]} -gt 0 ]]; then
        alert "High CPU usage containers: ${high_cpu_containers[*]}"
    fi

    if [[ ${#high_memory_containers[@]} -gt 0 ]]; then
        alert "High memory usage containers: ${high_memory_containers[*]}"
    fi
}

generate_health_report() {
    log "=== Container Health Report ==="

    echo "Running containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "Docker not available"

    echo
    echo "Container resource usage:"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null || echo "Stats not available"

    echo
    echo "Container health status:"
    docker ps --format "table {{.Names}}\t{{.Status}}" --filter "health=healthy" 2>/dev/null | head -10

    local unhealthy=$(docker ps --filter "health=unhealthy" --format "{{.Names}}" 2>/dev/null | wc -l)
    if [[ $unhealthy -gt 0 ]]; then
        echo "Unhealthy containers: $unhealthy"
        docker ps --filter "health=unhealthy" --format "table {{.Names}}\t{{.Status}}"
    fi
}

case "${1:-check}" in
    check)
        check_container_health
        check_container_resources
        ;;
    report)
        generate_health_report
        ;;
    restart-unhealthy)
        log "Restarting unhealthy containers..."
        docker ps --filter "health=unhealthy" --format "{{.Names}}" | while read -r container; do
            if [[ -n "$container" ]]; then
                log "Restarting unhealthy container: $container"
                docker restart "$container"
            fi
        done
        ;;
    *)
        echo "Usage: $0 {check|report|restart-unhealthy}"
        exit 1
        ;;
esac
