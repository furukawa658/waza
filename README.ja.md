# Waza - One-Click Skill Compiler

[English](README.md)

Wazaは、明示的に選んだチャット記録や作業メモと現在のGit差分から、再利用できるAgent Skillを作るVS Code拡張機能である。生成する`SKILL.md`、決定的な実行スクリプト、テスト定義を保存前に確認できる。

## 主な機能

- ステータスバーの`WAZA`キーからスキル生成を開始する
- アクティブエディターまたはユーザーが選んだMarkdown、JSON、JSONL、テキスト、ログを入力にする
- Gitステータス、差分統計、変更ファイル一覧、差分本文を生成根拠に含める
- APIキー、トークン、パスワードに似た値をモデル送信前に伏せる
- VS Codeの言語モデルへ送る前に、入力元、文字数、伏せた値の数を表示する
- `Bun`、`Node.js`、`Python`、`PowerShell`、`Rust`、`Zig`から利用できる実行環境を選ぶ
- `SKILL.md`、実行スクリプト、`SKILL.test.json`を保存前にエディターで表示する
- スクリプトの構文を検査し、失敗した生成物は保存しない
- 削除、Gitの変更、外部通信、環境変数、外部プロセスの生成を警告する
- `TRY`キーから最後のスキルを部分入力としてチャットへ開き、送信前に確認する

## 使い方

1. ワークスペースを開く。
2. スキル化したい作業記録をエディターで開くか、ファイルとして保存する。
3. ステータスバーの`WAZA`を押す。コマンドパレットでは`Waza: Compile Workflow to Skill`を実行する。
4. `Use active editor`または`Select workflow files`を選ぶ。
5. 送信する内容と伏せた値の数を確認し、使用する言語モデルを選ぶ。
6. 生成プレビューを確認する。
7. `Save validated skill`を選ぶ。
8. `.github/skills/<skill-name>/`へ`SKILL.md`、`scripts/`、`SKILL.test.json`が保存される。
9. ステータスバーの`TRY`を押すと、自然な依頼文が未送信の状態でチャットへ入る。

## 入力の扱い

WazaはCopilot Chatの非公開ストレージを自動で探索しない。入力になるのは、ユーザーがその場で選んだエディター内容またはファイルだけである。VS Codeの言語モデルAPIには、確認ダイアログで承認した後に送信する。

Git差分を入力へ加えるため、機密情報をコミット前に伏せる必要はないが、伏せ字処理は完全ではない。送信確認では入力元と文字数を確認すること。

## 設定

- `waza.preferredRuntime`: `auto`、`bun`、`node`、`python`、`powershell`、`rust`、`zig`
- `waza.maxInputCharacters`: モデルへ送る入力の最大文字数
- `waza.showRiskWarnings`: 保存前の危険操作警告を表示するか

## ショートカット

- `Ctrl+Alt+W`または`Cmd+Alt+W`: スキルを生成する
- `Ctrl+Alt+Enter`または`Cmd+Alt+Enter`: 最後のスキルをチャットで試す

## 開発

```bash
npm install
npm run typecheck
npm test
npm run build
npm run package
```

## ライセンス

Apache-2.0
