#!/bin/sh
sed -ie "s/version = '1.0'/version = '1.0t'/; s/alt = '1'/alt = '2'/" node_modules/intervaluecore-1.0-testnet/constants.js
