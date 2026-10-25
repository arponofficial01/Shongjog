// Localization dictionary supporting English and বাংলা (Bangla)
export type SupportedLanguage = 'en' | 'bn';

export const translations = {
  en: {
    appTitle: 'Shongjog (সংযোগ)',
    appSubtitle: 'Offline-First Bangladesh Mesh Network',
    tagline: 'Stay connected even when the internet is cut or unavailable.',
    
    // Transports
    transport_direct: 'Direct LAN (Offline 0kb)',
    transport_cloud: 'Cloud Synced (Supabase)',
    transport_queued: 'Offline Queued (Outbox)',
    transport_status_p2p: 'Peer Connected Direct',
    
    // Status banners
    network_online: 'Internet Connected',
    network_offline: 'Offline Mode (Local Network Active)',
    supabase_configured: 'Cloud Sync: Active',
    supabase_unconfigured: 'Cloud Sync: Local Only',
    syncing_now: 'Syncing messages...',
    
    // Navigation / Tabs
    chats: 'Chats',
    contacts: 'Contacts',
    offlinePairing: 'Offline Connect',
    callLogs: 'Calls',
    settings: 'Settings',
    
    // Auth / Profile Setup
    loginTitle: 'Welcome to Shongjog',
    loginSubtitle: 'Enter your phone number to initialize your secure device identity.',
    phoneNumber: 'Phone Number',
    phonePlaceholder: '01712345678 or +8801712345678',
    username: 'Username',
    usernamePlaceholder: 'e.g. rafi_rahman',
    displayName: 'Display Name',
    displayNamePlaceholder: 'e.g. Tanvir Ahmed',
    startMessaging: 'Start Messaging',
    deviceSecurityNotice: 'Your device cryptographic key pair will be generated locally. No internet needed to begin.',
    
    // Chat Screen
    typeMessage: 'Write a message...',
    recordingVoice: 'Recording voice...',
    holdToRecord: 'Tap to record voice message',
    releaseToSend: 'Tap to stop & send',
    cancelVoice: 'Cancel',
    audioCall: 'Audio Call',
    directOfflineCall: 'Direct Offline Audio Call',
    attachFile: 'Send File',
    transferringFile: 'Transferring file...',
    deliveredDirect: 'Delivered directly offline over LAN',
    queuedOffline: 'Saved offline in outbox',
    syncedCloud: 'Synced with cloud directory',
    
    // Calling
    incomingCall: 'Incoming Audio Call',
    outgoingCall: 'Calling Contact...',
    callConnected: 'In Call',
    callEnded: 'Call Ended',
    acceptCall: 'Accept',
    declineCall: 'Decline',
    endCall: 'End Call',
    mute: 'Mute',
    unmute: 'Unmute',
    liveAudioMeter: 'Microphone Activity',
    
    // Offline Pairing Screen
    offlineConnectTitle: 'Offline Direct P2P Connect',
    offlineConnectDesc: 'Connect two devices directly over local Wi-Fi, hotspot, or Bluetooth tethering without any internet connection.',
    myPairingOffer: 'Step 1: Your Device Offline Code',
    generateOfferBtn: 'Generate Offline Connection Code',
    copyCode: 'Copy Code',
    codeCopied: 'Code copied to clipboard!',
    step2Title: 'Step 2: Enter Peer Answer Code',
    applyAnswerBtn: 'Complete Connection',
    answerCodePlaceholder: 'Paste answer code from other device here...',
    orScanOfferTitle: 'Or Answer Peer Offer',
    pasteOfferPlaceholder: 'Paste offer code from device 1 here...',
    generateAnswerBtn: 'Generate Answer Code',
    
    // Contacts Screen
    addContact: 'Add Contact',
    newContactTitle: 'Save New Contact',
    searchContacts: 'Search contacts...',
    noContactsFound: 'No contacts yet. Add your friends or family.',
    callAction: 'Call',
    messageAction: 'Message',
    blockContact: 'Block',
    unblockContact: 'Unblock',
    
    // Settings Screen
    settingsTitle: 'Settings & Storage',
    deviceIdentity: 'Device Identity Key',
    deviceId: 'Device ID',
    storageUsed: 'IndexedDB Offline Storage',
    cloudBackend: 'Supabase Cloud Backend',
    supabaseUrl: 'Supabase Project URL',
    supabaseAnonKey: 'Supabase Anon Key',
    saveConfig: 'Save Configuration',
    configSaved: 'Configuration saved!',
    dataSaverMode: 'Low-Bandwidth Mode (Bangladesh Optimized)',
    language: 'Language / ভাষা',
    logout: 'Switch Account / Reset',
  },
  bn: {
    appTitle: 'সংযোগ (Shongjog)',
    appSubtitle: 'ইন্টারনেটবিহীন অফলাইন যোগাযোগ নেটওয়ার্ক',
    tagline: 'ইন্টারনেট বন্ধ বা না থাকলেও সরাসরি ডিভাইসে ডিভাইসে কথা বলুন।',
    
    // Transports
    transport_direct: 'সরাসরি লোকাল নেটওয়ার্ক (০ কেবি ডাটা)',
    transport_cloud: 'ক্লাউড সিঙ্কড (সুপাবেস)',
    transport_queued: 'অফলাইনে জমা আছে (আউটবক্স)',
    transport_status_p2p: 'ডিভাইস সরাসরি সংযুক্ত',
    
    // Status banners
    network_online: 'ইন্টারনেট চালু আছে',
    network_offline: 'অফলাইন মোড (লোকাল নেটওয়ার্ক সক্রিয়)',
    supabase_configured: 'ক্লাউড ব্যাকএন্ড: সংযুক্ত',
    supabase_unconfigured: 'ক্লাউড ব্যাকএন্ড: লোকাল মোড',
    syncing_now: 'বার্তা সিঙ্ক হচ্ছে...',
    
    // Navigation / Tabs
    chats: 'মেসেজ',
    contacts: 'কন্টাক্ট',
    offlinePairing: 'অফলাইন সংযোগ',
    callLogs: 'কল লগ',
    settings: 'সেটিংস',
    
    // Auth / Profile Setup
    loginTitle: 'সংযোগে স্বাগতম',
    loginSubtitle: 'আপনার নিরাপদ ডিজিটাল পরিচয় তৈরি করতে ফোন নম্বর লিখুন।',
    phoneNumber: 'ফোন নম্বর',
    phonePlaceholder: '০১৭xxxxxxxx বা +88017xxxxxxxx',
    username: 'ব্যবহারকারী নাম (Username)',
    usernamePlaceholder: 'যেমন: rafi_rahman',
    displayName: 'আপনার পুরো নাম',
    displayNamePlaceholder: 'যেমন: তানভীর আহমেদ',
    startMessaging: 'যোগাযোগ শুরু করুন',
    deviceSecurityNotice: 'আপনার ডিভাইসের এনক্রিপশন কী অফলাইনে তৈরি হবে। কোনো ইন্টারনেট লাগবে না।',
    
    // Chat Screen
    typeMessage: 'বার্তা লিখুন...',
    recordingVoice: 'ভয়েস রেকর্ড হচ্ছে...',
    holdToRecord: 'ভয়েস পাঠাতে ট্যাপ করুন',
    releaseToSend: 'বন্ধ করতে ও পাঠাতে ট্যাপ করুন',
    cancelVoice: 'বাতিল',
    audioCall: 'অডিও কল',
    directOfflineCall: 'ইন্টারনেট ছাড়া সরাসরি অফলাইন অডিও কল',
    attachFile: 'ফাইল পাঠান',
    transferringFile: 'ফাইল পাঠানো হচ্ছে...',
    deliveredDirect: 'লোকাল নেটওয়ার্কে সরাসরি পৌঁছেছে',
    queuedOffline: 'অফলাইনে জমা আছে',
    syncedCloud: 'ক্লাউডে সিঙ্ক হয়েছে',
    
    // Calling
    incomingCall: 'ইনকামিং অডিও কল',
    outgoingCall: 'কল করা হচ্ছে...',
    callConnected: 'কথা চলছে',
    callEnded: 'কল সমাপ্ত',
    acceptCall: 'রিসিভ করুন',
    declineCall: 'কেটে দিন',
    endCall: 'কল শেষ করুন',
    mute: 'মিউট',
    unmute: 'আনমিউট',
    liveAudioMeter: 'কথা বলার মাত্রা',
    
    // Offline Pairing Screen
    offlineConnectTitle: 'অফলাইন ডিভাইস সংযোগ',
    offlineConnectDesc: 'ইন্টারনেট ছাড়াই হটস্পট, ওয়াই-ফাই বা ব্লুটুথ সংযোগ দিয়ে দুটি ডিভাইস যুক্ত করুন।',
    myPairingOffer: 'ধাপ ১: আপনার ডিভাইসের অফলাইন কোড',
    generateOfferBtn: 'অফলাইন কোড তৈরি করুন',
    copyCode: 'কোড কপি করুন',
    codeCopied: 'কোড কপি করা হয়েছে!',
    step2Title: 'ধাপ ২: অপর ডিভাইসের উত্তর কোড লিখুন',
    applyAnswerBtn: 'সংযোগ সম্পন্ন করুন',
    answerCodePlaceholder: 'অপর ডিভাইসের কোড এখানে পেস্ট করুন...',
    orScanOfferTitle: 'অথবা অপর ডিভাইসের কোড দিন',
    pasteOfferPlaceholder: '১ম ডিভাইসের অফার কোড এখানে পেস্ট করুন...',
    generateAnswerBtn: 'উত্তর কোড তৈরি করুন',
    
    // Contacts Screen
    addContact: 'কন্টাক্ট যোগ করুন',
    newContactTitle: 'নতুন কন্টাক্ট সংরক্ষণ করুন',
    searchContacts: 'কন্টাক্ট খুঁজুন...',
    noContactsFound: 'কোনো কন্টাক্ট নেই। আপনার বন্ধু বা পরিবারের নম্বর যোগ করুন।',
    callAction: 'কল',
    messageAction: 'মেসেজ',
    blockContact: 'ব্লক',
    unblockContact: 'আনব্লক',
    
    // Settings Screen
    settingsTitle: 'সেটিংস ও স্টোরেজ',
    deviceIdentity: 'ডিভাইস এনক্রিপশন চাবি',
    deviceId: 'ডিভাইস আইডি',
    storageUsed: 'অফলাইন মেমরি ব্যবহার',
    cloudBackend: 'সুপাবেস ক্লাউড ব্যাকএন্ড',
    supabaseUrl: 'সুপাবেস প্রজেক্ট ইউআরএল',
    supabaseAnonKey: 'সুপাবেস পাবলিক কী',
    saveConfig: 'কনফিগারেশন সংরক্ষণ',
    configSaved: 'সংরক্ষিত হয়েছে!',
    dataSaverMode: 'কম ডাটা খরচ মোড (বাংলাদেশ অপ্টিমাইজড)',
    language: 'ভাষা / Language',
    logout: 'অ্যাকাউন্ট রিসেট / পরিবর্তন',
  },
};

let currentLanguage: SupportedLanguage = (localStorage.getItem('contact_app_lang') as SupportedLanguage) || 'en';

export function getLanguage(): SupportedLanguage {
  return currentLanguage;
}

export function setLanguage(lang: SupportedLanguage): void {
  currentLanguage = lang;
  localStorage.setItem('contact_app_lang', lang);
}

export function t(key: keyof typeof translations['en']): string {
  return translations[currentLanguage][key] || translations['en'][key] || key;
}
