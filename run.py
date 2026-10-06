# -*- coding: utf-8 -*-
"""求职备考管理软件 V1.0 启动入口。"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "backend"))

from app import main

if __name__ == "__main__":
    main(sys.argv[1:])
