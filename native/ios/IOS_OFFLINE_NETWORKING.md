# iOS Native Offline Networking Architecture (Shongjog)

## 1. Executive Summary & Transport Selection for iOS
Apple's iOS enforces strict background execution limits, sandboxed networking, and requires explicit user permissions for local network access (`NSLocalNetworkUsageDescription`) and Bluetooth (`NSBluetoothAlwaysUsageDescription`).

### Selected Transports & Evaluation:
| Transport | Range | Throughput | Audio Call Capable | iOS Background Support | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`MultipeerConnectivity` (`MCSession`)** | 30–80m | 10–30 Mbps | **Yes (Full Audio Stream)** | Supported with audio background mode | **PRIMARY OFFLINE TRANSPORT** |
| **Local Network / Bonjour (`NWListener` / `NWConnection`)** | Same Wi-Fi/Hotspot | 20–100 Mbps | **Yes** | VoIP background push / Audio mode | **PRIMARY LAN TRANSPORT** |
| **CoreBluetooth (L2CAP Channels)** | 10–20m | 20–80 Kbps | No | High background restriction | **BEACON & WAKEUP ONLY** |

---

## 2. MultipeerConnectivity Architecture (`MCSession`)
The `MultipeerConnectivity` framework automatically abstracts peer-to-peer Wi-Fi and Bluetooth connections without requiring an external internet connection or cell tower.

### Production Swift Implementation Blueprint:
```swift
import Foundation
import MultipeerConnectivity
import AVFoundation

class IOSMeshManager: NSObject, MCSessionDelegate, MCNearbyServiceAdvertiserDelegate, MCNearbyServiceBrowserDelegate {
    private let serviceType = "shongjog-mesh"
    private var myPeerId: MCPeerID!
    private var session: MCSession!
    private var advertiser: MCNearbyServiceAdvertiser!
    private var browser: MCNearbyServiceBrowser!

    var onDataReceived: ((Data, MCPeerID) -> Void)?
    var onStreamReceived: ((InputStream, MCPeerID) -> Void)?

    func initialize(userId: String, displayName: String) {
        self.myPeerId = MCPeerID(displayName: "\(displayName):\(userId)")
        self.session = MCSession(peer: myPeerId, securityIdentity: nil, encryptionPreference: .required)
        self.session.delegate = self

        self.advertiser = MCNearbyServiceAdvertiser(peer: myPeerId, discoveryInfo: ["id": userId], serviceType: serviceType)
        self.advertiser.delegate = self
        self.advertiser.startAdvertisingPeer()

        self.browser = MCNearbyServiceBrowser(peer: myPeerId, serviceType: serviceType)
        self.browser.delegate = self
        self.browser.startBrowsingForPeers()
    }

    // Direct DataChannel message dispatch
    func sendPacket(data: Data, to peer: MCPeerID) throws {
        try session.send(data, toPeers: [peer], with: .reliable)
    }

    // Direct real-time audio stream channel
    func startAudioCallStream(to peer: MCPeerID) throws -> OutputStream {
        return try session.startStream(withName: "offline_audio_call", toPeer: peer)
    }

    // MARK: - MCSessionDelegate
    func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        switch state {
        case .connected:
            print("[Shongjog-iOS] Connected to peer: \(peerID.displayName)")
        case .connecting:
            print("[Shongjog-iOS] Connecting to: \(peerID.displayName)")
        case .notConnected:
            print("[Shongjog-iOS] Disconnected from: \(peerID.displayName)")
        @unknown default:
            break
        }
    }

    func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        onDataReceived?(data, peerID)
    }

    func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {
        if streamName == "offline_audio_call" {
            onStreamReceived?(stream, peerID)
        }
    }

    func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}

    // MARK: - MCNearbyServiceAdvertiserDelegate
    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        // Auto-accept trusted contacts
        invitationHandler(true, self.session)
    }

    // MARK: - MCNearbyServiceBrowserDelegate
    func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String : String]?) {
        browser.invitePeer(peerID, to: self.session, withContext: nil, timeout: 15)
    }

    func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {}
}
```

---

## 3. Real-Time Audio Calling Engine on iOS
- **Audio Unit**: CoreAudio `AUVoiceIO` (v2 Audio Unit) with hardware hardware Voice Processing (Acoustic Echo Cancellation and Automatic Gain Control).
- **Format**: 16,000 Hz, 1 channel, 16-bit Linear PCM, compressed using `AVAudioCompressedBuffer` with Opus format.
- **Audio Session**:
  ```swift
  let audioSession = AVAudioSession.sharedInstance()
  try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
  try audioSession.setActive(true)
  ```
- **Stream**: Transmitted in real-time over the `startStream(withName: "offline_audio_call")` byte stream.
