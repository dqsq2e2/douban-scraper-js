# 豆瓣图书刮削插件 (JavaScript 版)

用于在 Ting Reader 中通过豆瓣网页抓取图书元数据。

## 功能

- 搜索豆瓣图书
- 获取图书的标题、作者、封面图、简介和标签
- 纯 JavaScript 实现，使用内置 `fetch` 和正则解析，轻量快速

## 说明

基于 `ting-reader` 系统的 JavaScript 刮削插件规范开发。由于豆瓣没有公开的 API，本插件直接通过解析豆瓣搜索页面 (`/search?cat=1001`) 和详情页面 (`/subject/:id/`) 来提取信息。
