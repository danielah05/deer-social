#!/usr/bin/env bash

if [ -z "$1" ] || [ "$1" != "no-intl" ]; then
  yarn intl:build
fi
yarn build-web

# build system outputs some srcs and hrefs like src="static/"
# need to rewrite to be src="/static/" to handle non root pages
sed -i 's/\(src\|href\)="static/\1="\/static/g' web-build/index.html

# we need to copy the static iframe html to support youtube embeds
cp -r bskyweb/static/iframe/ web-build/iframe

# copy our static pages over!
cp -r deer-static-about web-build/about
