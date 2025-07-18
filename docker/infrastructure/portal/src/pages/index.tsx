import { useState, useEffect } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { Shield, Server, HardDrive, Wifi, Activity, Play, Square, RotateCcw, FileText } from 'lucide-react';
import { SystemInfo, DockerServicesResponse, StorageInfo, NetworkInfo } from '@/types/system';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface ServiceControlsProps {
  serviceName: string;
  status: string;
  onAction: (serviceName: string, action: string) => void;
  onShowLogs: (serviceName: string) => void;
}

function ServiceControls({ serviceName, status, onAction, onShowLogs }: ServiceControlsProps) {
  return (
    <div className="flex gap-2">
      <button
        className="btn btn-success text-xs"
        onClick={() => onAction(serviceName, 'start')}
        disabled={status === 'running'}
      >
        <Play className="w-3 h-3" />
      </button>
      <button
        className="btn btn-danger text-xs"
        onClick={() => onAction(serviceName, 'stop')}
        disabled={status !== 'running'}
      >
        <Square className="w-3 h-3" />
      </button>
      <button
        className="btn btn-warning text-xs"
        onClick={() => onAction(serviceName, 'restart')}
      >
        <RotateCcw className="w-3 h-3" />
      </button>
      <button
        className="btn btn-secondary text-xs"
        onClick={() => onShowLogs(serviceName)}
      >
        <FileText className="w-3 h-3" />
      </button>
    </div>
  );
}

interface LogsModalProps {
  isOpen: boolean;
  serviceName: string;
  onClose: () => void;
}

function LogsModal({ isOpen, serviceName, onClose }: LogsModalProps) {
  const { data: logsData } = useSWR(
    isOpen && serviceName ? `/api/service/${serviceName}/logs` : null,
    fetcher
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-lg p-6 w-4/5 max-w-4xl max-h-4/5 overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">{serviceName} Logs</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>
        <div className="bg-dark-900 p-4 rounded font-mono text-sm overflow-y-auto max-h-96">
          {logsData?.logs || 'Loading logs...'}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [selectedService, setSelectedService] = useState<string>('');
  const [showLogs, setShowLogs] = useState(false);

  const { data: systemData, error: systemError } = useSWR<SystemInfo>('/api/system', fetcher, {
    refreshInterval: 30000
  });
  
  const { data: servicesData, error: servicesError, mutate: mutateServices } = useSWR<DockerServicesResponse>('/api/services', fetcher, {
    refreshInterval: 10000
  });
  
  const { data: storageData, error: storageError } = useSWR<StorageInfo>('/api/storage', fetcher, {
    refreshInterval: 60000
  });
  
  const { data: networkData, error: networkError } = useSWR<NetworkInfo>('/api/network', fetcher, {
    refreshInterval: 30000
  });

  const handleServiceAction = async (serviceName: string, action: string) => {
    try {
      const response = await fetch(`/api/service/${serviceName}/${action}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        // Refresh services data after action
        setTimeout(() => mutateServices(), 1000);
      } else {
        console.error(`Failed to ${action} ${serviceName}`);
      }
    } catch (error) {
      console.error(`Error ${action}ing ${serviceName}:`, error);
    }
  };

  const handleShowLogs = (serviceName: string) => {
    setSelectedService(serviceName);
    setShowLogs(true);
  };

  return (
    <>
      <Head>
        <title>DangerPrep Management Portal</title>
        <meta name="description" content="Emergency Router & Content Hub Management" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-dark-900">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Header */}
          <div className="text-center mb-8 p-6 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg">
            <div className="flex items-center justify-center gap-3 mb-2">
              <Shield className="w-8 h-8" />
              <h1 className="text-3xl font-bold">DangerPrep</h1>
            </div>
            <p className="text-blue-100">Emergency Router & Content Hub Management Portal</p>
          </div>

          {/* Dashboard Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {/* System Status */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-semibold">System Status</h3>
              </div>
              {systemError ? (
                <div className="text-red-400">Error loading system info</div>
              ) : !systemData ? (
                <div className="text-gray-400">Loading...</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-dark-700 p-3 rounded">
                    <div className="text-sm text-gray-400">Hostname</div>
                    <div className="font-semibold text-green-400">{systemData.hostname}</div>
                  </div>
                  <div className="bg-dark-700 p-3 rounded">
                    <div className="text-sm text-gray-400">Uptime</div>
                    <div className="font-semibold text-green-400">{systemData.uptime}</div>
                  </div>
                  <div className="bg-dark-700 p-3 rounded">
                    <div className="text-sm text-gray-400">Memory</div>
                    <div className="font-semibold text-green-400">{systemData.memory.percent.toFixed(1)}%</div>
                  </div>
                  <div className="bg-dark-700 p-3 rounded">
                    <div className="text-sm text-gray-400">Temperature</div>
                    <div className="font-semibold text-green-400">{systemData.temperature}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Storage */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <HardDrive className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-semibold">Storage</h3>
              </div>
              {storageError ? (
                <div className="text-red-400">Error loading storage info</div>
              ) : !storageData ? (
                <div className="text-gray-400">Loading...</div>
              ) : (
                <div className="space-y-3">
                  {storageData.partitions.map((partition, index) => (
                    <div key={index} className="bg-dark-700 p-3 rounded">
                      <div className="text-sm text-gray-400">{partition.mountpoint}</div>
                      <div className="font-semibold text-green-400">{partition.percent.toFixed(1)}% used</div>
                      <div className="text-xs text-gray-500">
                        {formatBytes(partition.used)} / {formatBytes(partition.total)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Network */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Wifi className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-semibold">Network</h3>
              </div>
              {networkError ? (
                <div className="text-red-400">Error loading network info</div>
              ) : !networkData ? (
                <div className="text-gray-400">Loading...</div>
              ) : (
                <div className="space-y-3">
                  {networkData.interfaces.map((iface, index) => {
                    const ipv4 = iface.addresses.find(addr => addr.type === 'IPv4');
                    return (
                      <div key={index} className="bg-dark-700 p-3 rounded">
                        <div className="text-sm text-gray-400">{iface.name}</div>
                        <div className="font-semibold text-green-400">
                          {ipv4 ? ipv4.address : 'No IP'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Services */}
          <div className="card">
            <div className="flex items-center gap-2 mb-6">
              <Server className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold">Services</h3>
            </div>
            {servicesError ? (
              <div className="text-red-400">Error loading services</div>
            ) : !servicesData ? (
              <div className="text-gray-400">Loading services...</div>
            ) : (
              <div className="space-y-3">
                {servicesData.services.map((service) => (
                  <div key={service.name} className="flex items-center justify-between bg-dark-700 p-4 rounded">
                    <div className="flex-1">
                      <div className="font-semibold">{service.name}</div>
                      <div className={`text-sm ${
                        service.status === 'running' ? 'status-running' : 
                        service.status === 'restarting' ? 'status-restarting' : 'status-stopped'
                      }`}>
                        Status: {service.status} | Health: {service.health}
                      </div>
                    </div>
                    <ServiceControls
                      serviceName={service.name}
                      status={service.status}
                      onAction={handleServiceAction}
                      onShowLogs={handleShowLogs}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <LogsModal
          isOpen={showLogs}
          serviceName={selectedService}
          onClose={() => setShowLogs(false)}
        />
      </div>
    </>
  );
}
