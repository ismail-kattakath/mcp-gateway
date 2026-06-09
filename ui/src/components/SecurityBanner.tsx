import { AlertTriangle, ExternalLink } from 'lucide-react';

interface SecurityBannerProps {
  repoUrl: string;
}

/**
 * Persistent security warning banner displayed when authentication is disabled.
 * Uses standard UI convention (prominent red banner at top) to alert users.
 */
function SecurityBanner({ repoUrl }: SecurityBannerProps): JSX.Element {
  return (
    <div className="bg-red-900/20 border-l-4 border-red-500 p-4 mb-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
        <div className="flex-1">
          <h3 className="text-red-500 font-semibold mb-1">Security Warning: Authentication Disabled</h3>
          <p className="text-gray-300 text-sm mb-2">
            Gateway authentication is currently <strong>DISABLED</strong>. Anyone with network access can
            call APIs without authentication. This is <strong>INSECURE</strong> for production deployments.
          </p>
          <a
            href={`${repoUrl}#authentication`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Learn more about securing your gateway
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}

export default SecurityBanner;
