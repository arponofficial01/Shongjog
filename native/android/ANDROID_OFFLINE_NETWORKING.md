# Android Native Offline Networking Architecture (Shongjog)

## 1. Executive Summary & Transport Selection for Bangladesh
In Bangladesh, low-end Android smartphones (Walton, Symphony, Xiaomi Redmi A-series, Samsung Galaxy M0x/A0x) are ubiquitous. Many lack simultaneous dual-band Wi-Fi or have aggressive vendor battery optimizations. 

### Selected Transports & Evaluation:
| Transport | Range | Throughput | Audio Call Capable | Battery Draw | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Wi-Fi Direct (`WifiP2pManager`)** | 50–100m | 15–50 Mbps | **Yes (Full HD Opus)** | Moderate | **PRIMARY DIRECT TRANSPORT** |
| **Local Wi-Fi / Hotspot Socket** | 50–100m | 20–80 Mbps | **Yes** | Low | **PRIMARY ZERO-CONFIG TRANSPORT** |
| **Bluetooth Low Energy (BLE)** | 10–30m | 5–20 Kbps | No (Too low throughput) | Extremely Low | **DISCOVERY & BEACONING ONLY** |
| **Bluetooth Classic (RFCOMM / L2CAP)** | 10–20m | 500 Kbps - 1 Mbps | Marginally (High Jitter) | High | **FALLBACK TEXT/VOICE NOTES** |

---

## 2. Wi-Fi Direct Architecture (`WifiP2pManager`)
When both devices have Wi-Fi turned on without an external router or cellular data:
1. Device A advertises a DNS-SD service (`_shongjog._tcp`).
2. Device B discovers Device A via `discoverServices()`.
3. Handshake connects via `connect()` producing a Group Owner (GO) with a known local IP (`192.168.49.1`).
4. TCP Sockets are bound to port `8888` for unified message/file transfer and UDP sockets are bound to port `8889` for raw Opus real-time audio streams.

### Production Kotlin Service Blueprint:
```kotlin
package com.shongjog.mesh.android

import android.content.Context
import android.net.wifi.p2p.*
import android.net.wifi.p2p.nsd.WifiP2pDnsSdServiceInfo
import android.net.wifi.p2p.nsd.WifiP2pDnsSdServiceRequest
import android.util.Log

class WifiDirectMeshManager(private val context: Context) {
    private val manager: WifiP2pManager? = context.getSystemService(Context.WIFI_P2P_SERVICE) as? WifiP2pManager
    private val channel: WifiP2pManager.Channel? = manager?.initialize(context, context.mainLooper, null)

    companion object {
        const val SERVICE_TYPE = "_shongjog._tcp"
        const val SERVICE_NAME = "ShongjogPeer"
    }

    /**
     * Broadcasts device presence for zero-internet discovery
     */
    fun startLocalAdvertising(deviceId: String, username: String) {
        val record = mapOf(
            "deviceId" to deviceId,
            "username" to username,
            "port" to "8888"
        )
        val serviceInfo = WifiP2pDnsSdServiceInfo.newInstance(SERVICE_NAME, SERVICE_TYPE, record)
        manager?.addLocalService(channel, serviceInfo, object : WifiP2pManager.ActionListener {
            override fun onSuccess() = Log.i("Shongjog", "Local Wi-Fi Direct service registered")
            override fun onFailure(reason: Int) = Log.e("Shongjog", "Registration failed: $reason")
        })
    }

    /**
     * Discovers nearby offline peers
     */
    fun discoverPeers(onPeerFound: (deviceId: String, deviceAddress: String) -> Unit) {
        val request = WifiP2pDnsSdServiceRequest.newInstance()
        manager?.addServiceRequest(channel, request, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
                manager.setDnsSdResponseListeners(channel,
                    { instanceName, registrationType, srcDevice ->
                        // Record discovered peer
                    },
                    { fullDomainName, txtRecordMap, srcDevice ->
                        val devId = txtRecordMap["deviceId"] ?: return@setDnsSdResponseListeners
                        onPeerFound(devId, srcDevice.deviceAddress)
                    }
                )
                manager.discoverServices(channel, null)
            }
            override fun onFailure(reason: Int) {}
        })
    }
}
```

---

## 3. Real-Time Offline Audio Calling on Android
- **Audio Capture**: Android `AudioRecord` configured at 16kHz / 24kHz Mono 16-bit PCM.
- **Audio Codec**: Hardware Opus encoder (`MediaCodec.createEncoderByType("audio/opus")`) or `libopus` native JNI wrapper, producing ~20 kbps compressed audio packets.
- **Transport**: Low-latency UDP Datagram socket with a 40ms jitter buffer.
- **Echo Cancellation**: `AcousticEchoCanceler.create(audioRecord.audioSessionId)` and `NoiseSuppressor.create(audioRecord.audioSessionId)`.

---

## 4. Bridge to Shongjog Web Core
The Android application embeds the high-performance Web app via Android `WebView` using `@JavascriptInterface` native bridge methods:
- `window.NativeAndroidMesh.dispatchDirectPacket(payload)`
- `window.NativeAndroidMesh.startOfflineCall(peerIp, port)`
- `window.NativeAndroidMesh.onPacketReceived(jsonString)`
This guarantees 100% shared business logic, identical IndexedDB database schemas, and seamless code parity.
