#!/usr/bin/env python3
"""
Deploy the ClaimVerifier Intelligent Contract to a GenLayer network.

Usage:
  pip install genlayer-py
  export GENLAYER_PRIVATE_KEY=0x...        # testnet-only key, NEVER a mainnet key
  python scripts/deploy-contract.py        # defaults to Bradbury testnet

After it prints the contract address, set these on your API host (Vercel):
  GENLAYER_RPC_URL            https://rpc-bradbury.genlayer.com
  GENLAYER_CONTRACT_ADDRESS   <printed address>
  GENLAYER_PRIVATE_KEY        <same key>
  GENLAYER_CHAIN              testnetBradbury
"""
import os
import sys
import pathlib

def main():
    key = os.environ.get("GENLAYER_PRIVATE_KEY")
    if not key:
        sys.exit("Set GENLAYER_PRIVATE_KEY first. Use a dedicated TESTNET-only key.")
    try:
        from genlayer_py import create_client, create_account
        from genlayer_py.chains import testnet_bradbury, localnet
    except ImportError:
        sys.exit("Missing SDK. Run: pip install genlayer-py")

    net = os.environ.get("GENLAYER_NETWORK", "testnet")
    if net == "localnet":
        client = create_client(chain=localnet, account=create_account(key))
        rpc = "http://127.0.0.1:4000/api"
    else:
        client = create_client(chain=testnet_bradbury, account=create_account(key))
        rpc = os.environ.get("GENLAYER_RPC_URL", "https://rpc-bradbury.genlayer.com")

    code = pathlib.Path(__file__).resolve().parent.parent / "contracts" / "ClaimVerifier.py"
    print(f"Deploying {code} to {net} ({rpc}) …")
    tx = client.deploy_contract(contract_path=str(code), constructor_args={})
    receipt = client.wait_for_transaction_receipt(hash=tx["hash"], status="FINALIZED", retries=60)
    address = receipt.get("contract_address") or receipt.get("data", {}).get("contract_address")
    if not address:
        sys.exit(f"Deployment finished but no address in receipt:\n{receipt}")
    print("\n✅ Deployed:", address)
    print("\nNext — set on your API host:")
    print(f"  GENLAYER_RPC_URL={rpc}")
    print(f"  GENLAYER_CONTRACT_ADDRESS={address}")
    print("  GENLAYER_PRIVATE_KEY=<the same key>")
    print("  GENLAYER_CHAIN=" + ("localnet" if net == "localnet" else "testnetBradbury"))

if __name__ == "__main__":
    main()
