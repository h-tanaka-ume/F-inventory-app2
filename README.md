# かんたん在庫管理アプリ

GitHub Pagesで公開できる、依存関係ゼロの在庫管理アプリです。ブラウザの`localStorage`にデータを保存します。

## 機能
- 在庫一覧：品番・品名・保管場所・在庫数・発注点・状態
- 要補充一覧：在庫数が発注点以下の商品を自動抽出
- 入出庫フォーム：入庫／出庫、数量、担当者、メモ。出庫時のマイナス在庫を防止
- 入出庫履歴：日時・種別・数量・担当者・メモ
- CSVインポート／エクスポート
- 品番自動生成：接頭辞＋ゼロ埋め連番（例：ITEM-0001）
- 在庫一覧の検索・絞り込み：フリーワード、保管場所、在庫状態をAND条件で組み合わせ可能
- 検索・絞り込み条件の一括クリア
- 商品ごとの削除と全商品の一括削除
- 品番設定：接頭辞・連番の桁数を変更可能
- 手入力への切り替えと重複チェック

## GitHub Pagesで公開する手順（画面操作）
1. GitHubにログインし、右上の`+`→`New repository`を開きます。
2. Repository nameに例として`inventory-app`と入力し、`Public`を選択して`Create repository`を押します。
3. リポジトリ画面で`Add file`→`Upload files`を選び、`index.html`、`app.js`、`style.css`、`README.md`を4つともアップロードします。
4. 下部の`Commit changes`を押します。
5. リポジトリの`Settings`→左メニューの`Pages`を開きます。
6. `Build and deployment`の`Source`を`Deploy from a branch`にし、Branchを`main`、フォルダを`/(root)`にして`Save`を押します。
7. 数十秒から数分後、Pages画面に表示されるURL（通常は`https://ユーザー名.github.io/inventory-app/`）を開きます。

## Gitコマンドで公開する場合
```bash
git init
git add index.html app.js style.css README.md
git commit -m "Add inventory management app"
git branch -M main
git remote add origin https://github.com/ユーザー名/inventory-app.git
git push -u origin main
```
その後、GitHubの`Settings`→`Pages`で`main`／`/(root)`を選択します。

## データについて
- データは利用したブラウザ・端末ごとのlocalStorageに保存されます。
- 商品一覧の「削除」で個別削除、「全商品を削除」で初期サンプルを含む全商品と関連履歴を削除できます。
- 保存キーは`simpleInventoryApp_v1`です。削除後にページを再読み込みしても、削除済み商品は復活しません。
- 品番の接頭辞、桁数、次回採番番号もlocalStorageに保存されます。
- 既存商品を走査して同じ品番が存在する場合は、重複しない次の番号を採番します。
- 別の端末とは自動同期されません。定期的にCSVエクスポートしてください。
- 複数人で同時利用する場合や、ログイン・権限・共有DBが必要な場合は、FirebaseやSupabaseなどのバックエンド構成へ拡張してください。
