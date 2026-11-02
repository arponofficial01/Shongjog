import React, { useState } from 'react';
import { Copy, Check, Link2, WifiOff, ShieldCheck, QrCode, FileText, X } from 'lucide-react';
import QRCode from 'qrcode';
import { OfflinePairing } from '../services/transport/offlinePairing';
import { TransportManager } from '../services/transport/transportManager';
import { WebRTCService } from '../services/transport/webrtcService';
import { getDatabase } from '../services/db/database';
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
  const [viewFormat, setViewFormat] = useState<'qr' | 'code'>('qr');

  // Offerer state
  const [generatedOfferCode, setGeneratedOfferCode] = useState('');
  const [offerQrUrl, setOfferQrUrl] = useState('');
  const [offererPc, setOffererPc] = useState<RTCPeerConnection | null>(null);
  const [offererDc, setOffererDc] = useState<RTCDataChannel | null>(null);
  const [answerInputCode, setAnswerInputCode] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Callee / Answerer state
  const [offerInputCode, setOfferInputCode] = useState('');
  const [generatedAnswerCode, setGeneratedAnswerCode] = useState('');
  const [answerQrUrl, setAnswerQrUrl] = useState('');
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
      setOffererDc(dc);
      setGeneratedOfferCode(pairingCode);

      QRCode.toDataURL(pairingCode, {
        width: 240,
        margin: 2,
        color: { dark: '#041019', light: '#ffffff' },
      })
        .then((url) => setOfferQrUrl(url))
        .catch(() => {});

      // Listen for data channel connection
      dc.onopen = async () => {
        setStatusMessage('Direct Peer Connection Established!');
      };

      setStatusMessage('Offer ready! Scan the QR code or copy the code to peer device.');
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
      const answerPayload = await OfflinePairing.applyDirectAnswer(offererPc, answerInputCode.trim());
      const peerId = answerPayload.senderId;
      const peerName = answerPayload.senderName || 'Offline Peer';

      if (offererPc && offererDc) {
        WebRTCService.getInstance(localUserId, peerId).adoptConnection(offererPc, offererDc);
      }

      TransportManager.registerPeerConnected(peerId);

      // Auto-save contact to IndexedDB address book
      try {
        const db = await getDatabase();
        const existing = await db.get('contacts', peerId);
        if (!existing) {
          await db.put('contacts', {
            id: peerId,
            phoneNumber: 'Offline Direct Peer',
            displayName: peerName,
            username: peerName.toLowerCase().replace(/\s+/g, '_'),
            isBlocked: false,
            isOnlineDirect: true,
            lastSeen: Date.now(),
          });
        }
      } catch (e) {
        console.warn('Could not auto-save contact:', e);
      }

      setStatusMessage(`Pairing complete! Connected directly with ${peerName}`);
      onConnectedPeer(peerId, peerName);
      setTimeout(() => onClose(), 1200);
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
      const { pc, answerCode, offerPayload, onDataChannel } = await OfflinePairing.generateDirectAnswer(
        offerInputCode.trim(),
        localUserId,
        localUserName,
        true
      );

      const peerId = offerPayload.senderId;
      const peerName = offerPayload.senderName || 'Offline Peer';

      setGeneratedAnswerCode(answerCode);
      QRCode.toDataURL(answerCode, {
        width: 240,
        margin: 2,
        color: { dark: '#041019', light: '#ffffff' },
      })
        .then((url) => setAnswerQrUrl(url))
        .catch(() => {});

      onDataChannel((channel) => {
        channel.onopen = async () => {
          setStatusMessage(`Direct Peer Connection Established with ${peerName}!`);
          WebRTCService.getInstance(localUserId, peerId).adoptConnection(pc, channel);
          TransportManager.registerPeerConnected(peerId);

          try {
            const db = await getDatabase();
            const existing = await db.get('contacts', peerId);
            if (!existing) {
              await db.put('contacts', {
                id: peerId,
                phoneNumber: 'Offline Direct Peer',
                displayName: peerName,
                username: peerName.toLowerCase().replace(/\s+/g, '_'),
                isBlocked: false,
                isOnlineDirect: true,
                lastSeen: Date.now(),
              });
            }
          } catch (e) {
            console.warn('Could not auto-save contact:', e);
          }

          onConnectedPeer(peerId, peerName);
          setTimeout(() => onClose(), 1200);
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
    <div className="custom-modal-backdrop offline-pairing-backdrop" onClick={onClose}>
      <div
        className="offline-pairing-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="offline-header-icon-box">
              <WifiOff size={22} />
            </div>
            <div>
              <h2 className="offline-modal-title">
                {t('offlinePairing')}
              </h2>
              <span className="offline-modal-subtitle">
                Zero-Internet Direct WebRTC Device Pairing
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="offline-modal-close-btn"
          >
            <X size={17} />
          </button>
        </div>

        {/* Security Badge */}
        <div className="offline-security-badge">
          <ShieldCheck size={18} style={{ flexShrink: 0 }} />
          <span>Direct point-to-point connection over local Wi-Fi, hotspot, or Bluetooth tethering.</span>
        </div>

        {/* Mode Selector Tabs */}
        <div className="offline-tab-track">
          <button
            type="button"
            onClick={() => setActiveTab('createOffer')}
            className={`offline-tab-btn ${activeTab === 'createOffer' ? 'active' : ''}`}
          >
            Device 1 (Host Offer)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('answerOffer')}
            className={`offline-tab-btn ${activeTab === 'answerOffer' ? 'active' : ''}`}
          >
            Device 2 (Join / Answer)
          </button>
        </div>

        {statusMessage && (
          <div className="offline-status-banner">
            {statusMessage}
          </div>
        )}

        {/* Tab 1: Device 1 (Offerer) */}
        {activeTab === 'createOffer' ? (
          <div>
            <div className="offline-step-card">
              <h3 className="offline-step-title">
                {t('myPairingOffer')}
              </h3>

              {!generatedOfferCode ? (
                <button
                  type="button"
                  onClick={handleGenerateOffer}
                  disabled={isGenerating}
                  className="offline-action-btn primary"
                >
                  <Link2 size={17} />
                  {isGenerating ? 'Generating...' : t('generateOfferBtn')}
                </button>
              ) : (
                <div>
                  {/* Format Toggle: QR vs Code */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={() => setViewFormat('qr')}
                      className={`offline-format-pill ${viewFormat === 'qr' ? 'active' : ''}`}
                    >
                      <QrCode size={14} /> QR Code
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewFormat('code')}
                      className={`offline-format-pill ${viewFormat === 'code' ? 'active' : ''}`}
                    >
                      <FileText size={14} /> Text Code
                    </button>
                  </div>

                  {viewFormat === 'qr' && offerQrUrl ? (
                    <div className="offline-qr-box">
                      <img src={offerQrUrl} alt="Offer QR Code" style={{ width: '210px', height: '210px', display: 'block' }} />
                      <span className="offline-qr-caption">
                        Scan on Device 2
                      </span>
                    </div>
                  ) : (
                    <div className="offline-code-display">
                      {generatedOfferCode}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedOfferCode, false)}
                    className="offline-copy-btn"
                  >
                    {isCopied ? <Check size={16} color="#34d399" /> : <Copy size={16} />}
                    {isCopied ? t('codeCopied') : t('copyCode')}
                  </button>
                </div>
              )}
            </div>

            {generatedOfferCode && (
              <div className="offline-step-card" style={{ marginTop: 16 }}>
                <h3 className="offline-step-title">
                  {t('step2Title')}
                </h3>
                <textarea
                  rows={3}
                  placeholder={t('answerCodePlaceholder')}
                  value={answerInputCode}
                  onChange={(e) => setAnswerInputCode(e.target.value)}
                  className="offline-code-textarea"
                />
                <button
                  type="button"
                  onClick={handleApplyAnswer}
                  disabled={!answerInputCode.trim()}
                  className="offline-action-btn primary"
                >
                  <Link2 size={17} />
                  {t('applyAnswerBtn')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="offline-step-card">
              <h3 className="offline-step-title">
                {t('orScanOfferTitle')}
              </h3>
              <textarea
                rows={3}
                placeholder={t('pasteOfferPlaceholder')}
                value={offerInputCode}
                onChange={(e) => setOfferInputCode(e.target.value)}
                className="offline-code-textarea"
              />
              <button
                type="button"
                onClick={handleGenerateAnswer}
                disabled={isGenerating || !offerInputCode.trim()}
                className="offline-action-btn primary"
              >
                {isGenerating ? 'Computing...' : t('generateAnswerBtn')}
              </button>
            </div>

            {generatedAnswerCode && (
              <div className="offline-step-card" style={{ marginTop: 16 }}>
                <h3 className="offline-step-title">
                  Your Answer Code (Provide to Device 1)
                </h3>
                {answerQrUrl ? (
                  <div className="offline-qr-box">
                    <img src={answerQrUrl} alt="Answer QR Code" style={{ width: '210px', height: '210px', display: 'block' }} />
                    <span className="offline-qr-caption">
                      Device 1 Scan or Copy Text
                    </span>
                  </div>
                ) : (
                  <div className="offline-code-display">
                    {generatedAnswerCode}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => copyToClipboard(generatedAnswerCode, true)}
                  className="offline-copy-btn"
                >
                  {isAnswerCopied ? <Check size={16} color="#34d399" /> : <Copy size={16} />}
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
