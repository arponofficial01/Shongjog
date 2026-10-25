import React from 'react';
import {
  ArrowLeft,
  Shield,
  Bell,
  HardDrive,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import type { UserProfile } from '../services/db/database';

interface SettingsPanelProps {
  profile: UserProfile;
  onBack: () => void;
  onProfileReset: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  profile,
  onBack,
  onProfileReset,
}) => {
  return (
    <div className="wa-drawer">
      <div className="wa-drawer-header">
        <button type="button" onClick={onBack} style={{ color: 'white' }}>
          <ArrowLeft size={24} />
        </button>
        <h2>Settings</h2>
      </div>

      <div className="wa-drawer-body" style={{ padding: '0' }}>
        {/* Profile Card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '20px 16px',
            borderBottom: '1px solid var(--wa-border)',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 82,
              height: 82,
              borderRadius: '50%',
              backgroundColor: '#6a7175',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '32px',
              fontWeight: 500,
            }}
          >
            {profile.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: '19px', color: '#e9edef', marginBottom: 4 }}>
              {profile.displayName}
            </div>
            <div style={{ fontSize: '14px', color: '#8696a0' }}>
              {profile.phoneNumber}
            </div>
            <div style={{ fontSize: '13px', color: '#00a884', marginTop: 4 }}>
              Online • Available
            </div>
          </div>
        </div>

        {/* Settings Options List */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 24px',
              borderBottom: '1px solid var(--wa-border)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <Shield size={22} color="#8696a0" />
              <div>
                <div style={{ fontSize: '16px', color: '#e9edef' }}>Privacy & Security</div>
                <div style={{ fontSize: '13px', color: '#8696a0' }}>End-to-end encrypted, blocked contacts</div>
              </div>
            </div>
            <ChevronRight size={18} color="#667781" />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 24px',
              borderBottom: '1px solid var(--wa-border)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <Bell size={22} color="#8696a0" />
              <div>
                <div style={{ fontSize: '16px', color: '#e9edef' }}>Notifications</div>
                <div style={{ fontSize: '13px', color: '#8696a0' }}>Message sounds & call alerts</div>
              </div>
            </div>
            <ChevronRight size={18} color="#667781" />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 24px',
              borderBottom: '1px solid var(--wa-border)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <HardDrive size={22} color="#8696a0" />
              <div>
                <div style={{ fontSize: '16px', color: '#e9edef' }}>Storage and Data</div>
                <div style={{ fontSize: '13px', color: '#8696a0' }}>Offline cache & media storage</div>
              </div>
            </div>
            <ChevronRight size={18} color="#667781" />
          </div>

          {/* Log Out */}
          <div
            onClick={onProfileReset}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              padding: '18px 24px',
              marginTop: 20,
              cursor: 'pointer',
              color: '#ea0038',
            }}
          >
            <LogOut size={22} color="#ea0038" />
            <div style={{ fontSize: '16px', fontWeight: 500 }}>Log Out</div>
          </div>
        </div>
      </div>
    </div>
  );
};
