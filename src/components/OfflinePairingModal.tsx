import React, { useState } from 'react';
import { Copy, Check, Link2, WifiOff, ShieldCheck } from 'lucide-react';
import { OfflinePairing } from '../services/transport/offlinePairing';
import { TransportManager } from '../services/transport/transportManager';
import { t } from '../i18n/translations';

interface OfflinePairingModalProps {
  localUserId: string;
  localUserName: string;
  onClose: () => void;
  onConnectedPeer: (peerId: string, peerName: string) => void;
}

export const OfflinePairingModal: React.FC<OfflinePairingModalProps> = ({
  localUserId,
  localUserName,
  onClose,
  onConnectedPeer,
}) => {
  const [activeTab, setActiveTab] = useState<'createOffer' | 'answerOffer'>('createOffer');
  
  // Offerer state
  const [generatedOfferCode, setGeneratedOfferCode] = useState('');
  const [offererPc, setOffererPc] = useState<RTCPeerConnection | null>(null);
  const [answerInputCode, setAnswerInputCode] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Callee / Answerer state
  const [offerInputCode, setOfferInputCode] = useState('');
  const [generatedAnswerCode, setGeneratedAnswerCode] = useState('');
  const [isAnswerCopied, setIsAnswerCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Step 1: Offerer creates offer
  const handleGenerateOffer = async () => {
    setIsGenerating(true);
    setStatusMessage('Generating local WebRTC ICE candidates...');
    try {
      const { pc, dc, pairingCode } = await OfflinePairing.generateDirectOffer(
        localUserId,
        localUserName,
        true // with audio enabled for instant calling capability
      );

      setOffererPc(pc);
      setGeneratedOfferCode(pairingCode);

      // Listen for data channel connection
      dc.onopen = () => {
        setStatusMessage('Direct Peer Connection Established!');
        TransportManager.registerPeerConnected('peer_direct_lan');
        onConnectedPeer('peer_direct_lan', 'Offline Peer');
      };

      setStatusMessage('Offer ready! Copy and share this code with peer device.');
    } catch (err: any) {
      setStatusMessage('Failed to generate offer: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Step 2: Offerer applies answer from peer
  const handleApplyAnswer = async () => {
    if (!offererPc || !answerInputCode.trim()) return;
    try {
      setStatusMessage('Applying peer answer...');
      await OfflinePairing.applyDirectAnswer(offererPc, answerInputCode.trim());
      setStatusMessage('Pairing handshake complete! Testing direct P2P data flow...');
    } catch (err: any) {
      setStatusMessage('Error applying answer: ' + err.message);
    }
  };

  // Callee creates answer
  const handleGenerateAnswer = async () => {
    if (!offerInputCode.trim()) return;
    setIsGenerating(true);
    try {
      setStatusMessage('Processing offer and generating answer...');
      const { answerCode, onDataChannel } = await OfflinePairing.generateDirectAnswer(
        offerInputCode.trim(),
        localUserId,
        localUserName,
        true
      );

      setGeneratedAnswerCode(answerCode);

      onDataChannel((channel) => {
        channel.onopen = () => {
          setStatusMessage('Direct Peer Connection Established!');
          TransportManager.registerPeerConnected('peer_direct_lan');
          onConnectedPeer('peer_direct_lan', 'Offline Peer');
        };
      });

      setStatusMessage('Answer code generated! Send this back to Device 1.');
    } catch (err: any) {
      setStatusMessage('Error processing offer: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, isAnswer: boolean = false) => {
    navigator.clipboard.writeText(text);
    if (isAnswer) {
      setIsAnswerCopied(true);
      setTimeout(() => setIsAnswerCopied(false), 2000);
    } else {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.85)',
        backdropFilter: 'blur(16px)',
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        className="pairing-panel"
        style={{
          backgroundColor: '#0c1220',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <WifiOff size={20} color="#10b981" />
              {t('offlineConnectTitle')}
            </h2>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: 4 }}>
              {t('offlineConnectDesc')}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.08)',
              fontSize: '13px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'createOffer' ? 'active' : ''}`}
            onClick={() => setActiveTab('createOffer')}
          >
            Device 1: Initiate (Offer)
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'answerOffer' ? 'active' : ''}`}
            onClick={() => setActiveTab('answerOffer')}
          >
            Device 2: Join (Answer)
          </button>
        </div>

        {statusMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              fontSize: '12px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <ShieldCheck size={16} />
            {statusMessage}
          </div>
        )}

        {activeTab === 'createOffer' ? (
          <div>
            <div className="pairing-step-box">
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: 8 }}>
                {t('myPairingOffer')}
              </h3>
              {!generatedOfferCode ? (
                <button
                  type="button"
                  onClick={handleGenerateOffer}
                  disabled={isGenerating}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--emerald-primary)',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '13px',
                    width: '100%',
                  }}
                >
                  {isGenerating ? 'Generating...' : t('generateOfferBtn')}
                </button>
              ) : (
                <div>
                  <div className="pairing-code-area">{generatedOfferCode}</div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedOfferCode, false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      width: '100%',
                      padding: '8px',
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                    }}
                  >
                    {isCopied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                    {isCopied ? t('codeCopied') : t('copyCode')}
                  </button>
                </div>
              )}
            </div>

            {generatedOfferCode && (
              <div className="pairing-step-box">
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: 8 }}>
                  {t('step2Title')}
                </h3>
                <textarea
                  rows={3}
                  placeholder={t('answerCodePlaceholder')}
                  value={answerInputCode}
                  onChange={(e) => setAnswerInputCode(e.target.value)}
                  style={{ width: '100%', marginBottom: 10, fontSize: '12px' }}
                />
                <button
                  type="button"
                  onClick={handleApplyAnswer}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '10px 18px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--emerald-primary)',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '13px',
                    width: '100%',
                  }}
                >
                  <Link2 size={16} />
                  {t('applyAnswerBtn')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="pairing-step-box">
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: 8 }}>
                {t('orScanOfferTitle')}
              </h3>
              <textarea
                rows={3}
                placeholder={t('pasteOfferPlaceholder')}
                value={offerInputCode}
                onChange={(e) => setOfferInputCode(e.target.value)}
                style={{ width: '100%', marginBottom: 10, fontSize: '12px' }}
              />
              <button
                type="button"
                onClick={handleGenerateAnswer}
                disabled={isGenerating || !offerInputCode.trim()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '10px 18px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--emerald-primary)',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '13px',
                  width: '100%',
                }}
              >
                {isGenerating ? 'Computing...' : t('generateAnswerBtn')}
              </button>
            </div>

            {generatedAnswerCode && (
              <div className="pairing-step-box">
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: 8 }}>
                  Your Answer Code (Provide to Device 1)
                </h3>
                <div className="pairing-code-area">{generatedAnswerCode}</div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(generatedAnswerCode, true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    width: '100%',
                    padding: '8px',
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                  }}
                >
                  {isAnswerCopied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  {isAnswerCopied ? t('codeCopied') : t('copyCode')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
