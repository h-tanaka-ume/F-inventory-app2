// Supabase接続設定
// ここにSupabaseプロジェクトのURLとanon（publishable）キーを入力すると、共有DBモードになります。
// 空欄のままなら、従来どおりブラウザ内localStorageモードで動作します。
window.INVENTORY_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  enableRealtime: true
};
