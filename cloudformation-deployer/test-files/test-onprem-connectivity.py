#!/usr/bin/env python3

import socket
import subprocess
import sys
import ssl

def test_tcp_connection(host, port):
    """Test basic TCP connectivity"""
    print(f"\n1️⃣ Testing TCP connection to {host}:{port}...")
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        result = sock.connect_ex((host, port))
        sock.close()
        
        if result == 0:
            print(f"✅ TCP connection successful")
            return True
        else:
            print(f"❌ TCP connection failed (error code: {result})")
            return False
    except Exception as e:
        print(f"❌ TCP connection error: {e}")
        return False

def test_https_endpoint(host, port):
    """Test HTTPS endpoint"""
    print(f"\n2️⃣ Testing HTTPS/TLS handshake to {host}:{port}")
    try:
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        
        with socket.create_connection((host, port), timeout=10) as sock:
            with context.wrap_socket(sock, server_hostname=host) as ssock:
                print(f"✅ TLS handshake successful")
                print(f"   Protocol: {ssock.version()}")
                return True
    except socket.timeout:
        print(f"❌ Connection timed out")
        return False
    except Exception as e:
        print(f"❌ TLS error: {e}")
        return False

def test_kubectl_access():
    """Test kubectl access to onprem-cluster"""
    print(f"\n3️⃣ Testing kubectl access to onprem-cluster...")
    try:
        result = subprocess.run(
            ['kubectl', '--context', 'onprem-cluster', 'cluster-info'],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            print(f"✅ kubectl access successful")
            print(f"   {result.stdout}")
            return True
        else:
            print(f"❌ kubectl access failed")
            print(f"   {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print(f"❌ kubectl command timed out")
        return False
    except FileNotFoundError:
        print(f"⚠️  kubectl not found")
        return False
    except Exception as e:
        print(f"❌ kubectl error: {e}")
        return False

def main():
    print("🔍 ON-PREM CLUSTER CONNECTIVITY TEST")
    print("=" * 60)
    
    host = "10.145.21.231"
    port = 6443
    
    tcp_ok = test_tcp_connection(host, port)
    https_ok = test_https_endpoint(host, port)
    kubectl_ok = test_kubectl_access()
    
    print("\n" + "=" * 60)
    print("📋 SUMMARY:")
    print(f"   TCP Connection:    {'✅' if tcp_ok else '❌'}")
    print(f"   HTTPS Endpoint:    {'✅' if https_ok else '❌'}")
    print(f"   kubectl Access:    {'✅' if kubectl_ok else '❌'}")
    
    if tcp_ok and (https_ok or kubectl_ok):
        print("\n✅ Connectivity is working!")
        print("   ArgoCD should be able to reach the cluster.")
        return 0
    else:
        print("\n❌ Connectivity issues detected")
        print("\n💡 Next steps:")
        print("   1. Check network routing between AWS and on-prem")
        print("   2. Verify firewall rules allow port 6443")
        print("   3. Ensure VPN/VPC peering is configured")
        return 1

if __name__ == "__main__":
    sys.exit(main())
