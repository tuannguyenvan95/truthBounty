import pytest
import json
from typing import Dict, Any, Optional
from pathlib import Path


@pytest.fixture
def sim_install_mocks(request):
    """
    Fixture supporting bare-dict mock installation for both GenLayer simulator
    RPC (`sim_installMocks`) and direct VM execution mode.
    """
    def _install(
        gl_or_vm: Any,
        mock_web: Optional[Dict[str, Dict[str, Any]]] = None,
        mock_llm: Optional[Dict[str, str]] = None,
    ):
        """
        Installs bare-dict mocks for web requests and LLM prompt executions.
        
        mock_web: Dict mapping URL pattern/string to {"body": "...", "status": 200, "method": "GET"}
        mock_llm: Dict mapping prompt regex/substring to JSON string response
        """
        # 1. If running under direct_vm
        if hasattr(gl_or_vm, "mock_web") and hasattr(gl_or_vm, "mock_llm"):
            if mock_web:
                for url, data in mock_web.items():
                    gl_or_vm.mock_web(
                        url,
                        {
                            "method": data.get("method", "GET"),
                            "status": data.get("status", 200),
                            "body": data.get("body", ""),
                        },
                    )
            if mock_llm:
                for pattern, resp in mock_llm.items():
                    gl_or_vm.mock_llm(pattern, resp)
            return True

        # 2. If running against GenLayer Simulator JSON-RPC client
        bare_dict = {
            "mock_response": {
                "response": mock_llm or {},
                "eq_principle_prompt_comparative": {},
                "eq_principle_prompt_non_comparative": {},
            },
            "mock_web_response": {
                "nondet_web_request": {
                    url: {
                        "method": data.get("method", "GET"),
                        "status": data.get("status", 200),
                        "body": data.get("body", ""),
                    }
                    for url, data in (mock_web or {}).items()
                }
            },
        }

        if hasattr(gl_or_vm, "request"):
            try:
                return gl_or_vm.request("sim_installMocks", [bare_dict])
            except Exception as err:
                print(f"Warning: sim_installMocks RPC failed: {err}")
                return False

        return False

    return _install


@pytest.fixture
def direct_charlie():
    """Third independent address for multi-juror appeal testing."""
    return b"\x99\x88\x77\x66\x55\x44\x33\x22\x11\x00\xaa\xbb\xcc\xdd\xee\xff\x12\x34\x56\x78"


@pytest.fixture(autouse=True)
def sync_direct_vm_warp(direct_vm):
    """
    Ensure direct_vm.warp also synchronizes gl.message_raw['datetime']
    so contracts prioritizing authoritative gl.message_raw['datetime']
    receive the exact warped timestamp.
    """
    orig_warp = direct_vm.warp
    def _wrapped_warp(timestamp: str) -> None:
        orig_warp(timestamp)
        import sys
        if 'genlayer.gl' in sys.modules:
            gl = sys.modules['genlayer.gl']
            if hasattr(gl, 'message_raw') and isinstance(gl.message_raw, dict):
                gl.message_raw['datetime'] = timestamp
    direct_vm.warp = _wrapped_warp
