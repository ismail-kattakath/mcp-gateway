import { useState, useEffect } from 'react';
import { GitCommit, Calendar, Package } from 'lucide-react';
import { getVersion } from '../api/client';

interface VersionInfo {
  version: string;
  revision: string;
  created: string;
  source: string;
  title: string;
  description: string;
  licenses: string;
  nodeVersion: string;
  platform: string;
  arch: string;
}

export default function VersionFooter(): JSX.Element {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [expanded, setExpanded] = useState<boolean>(false);

  useEffect(() => {
    getVersion()
      .then((data) => setVersion(data))
      .catch((err) => console.error('Failed to fetch version:', err));
  }, []);

  if (!version) return <div></div>;

  const shortRevision = version.revision.substring(0, 7);
  const buildDate = new Date(version.created).toLocaleDateString();

  return (
    <div className="border-t border-dark-border p-4 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left text-gray-400 hover:text-white transition-colors"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            <span className="font-medium">v{version.version}</span>
          </div>
          <span className="text-gray-500">{expanded ? '▼' : '▶'}</span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 mt-2 text-gray-400">
          <div className="flex items-center gap-2">
            <GitCommit className="w-3 h-3" />
            <a
              href={`${version.source}/commit/${version.revision}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white hover:underline font-mono"
            >
              {shortRevision}
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-3 h-3" />
            <span>{buildDate}</span>
          </div>
          <div className="text-[10px] text-gray-500">
            Node {version.nodeVersion}
          </div>
          <div className="text-[10px] text-gray-500">
            {version.platform}/{version.arch}
          </div>
          <a
            href={version.source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-400 hover:underline block"
          >
            GitHub →
          </a>
        </div>
      )}
    </div>
  );
}
