#!/bin/bash
source /etc/profile

SCRIPT_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
pushd .
cd $SCRIPT_DIR
node ./main.js
popd .
