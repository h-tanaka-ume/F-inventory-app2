// Supabase接続設定
// ここにSupabaseプロジェクトのURLとanon（publishable）キーを入力すると、共有DBモードになります。
// 空欄のままなら、従来どおりブラウザ内localStorageモードで動作します。
window.INVENTORY_CONFIG = {
  supabaseUrl: "https://wpoghiifdyossvpbutvw.supabase.co/rest/v1/",
  supabaseAnonKey: "sb_publishable_2pMlmzXc4uJtruz1GVS_ow_1i2bSx4m",
  enableRealtime: true
};
